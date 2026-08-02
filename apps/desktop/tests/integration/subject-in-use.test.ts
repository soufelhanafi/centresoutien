import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Subject,
  SubjectId,
  Group,
  GroupId,
  CenterCode,
  DeviceId,
  RoomId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteGroupRepository } from '../../src/data/sqlite/repositories/group-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const AT = new Date('2026-07-29T10:00:00Z');

const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSICS = 'sub_00000000000000000000000002' as SubjectId;
const ARABIC = 'sub_00000000000000000000000003' as SubjectId;

let dir: string;
let db: DB;
let subjects: SqliteSubjectRepository;
let groups: SqliteGroupRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-subj-inuse-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  subjects = new SqliteSubjectRepository(db);
  groups = new SqliteGroupRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeSubject(over: Partial<Subject> = {}): Subject {
  return {
    id: MATH,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: null,
    active: true,
    ...over,
  };
}

let groupSeq = 0;
function makeGroup(over: Partial<Group> = {}): Group {
  groupSeq += 1;
  return {
    id: `grp_${String(groupSeq).padStart(26, '0')}` as GroupId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    subjectId: MATH,
    teacherId: null,
    roomId: 'rom_00000000000000000000000001' as RoomId,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...over,
  };
}

describe('SqliteSubjectRepository.listWithUsage', () => {
  it('reports inUseCount 0, canDelete true, and no references for a subject with no groups', async () => {
    await subjects.save(makeSubject());
    const rows = await subjects.listWithUsage(CENTER);
    expect(rows).toEqual([
      { subject: makeSubject(), inUseCount: 0, canDelete: true, references: [] },
    ]);
  });

  it('counts N active groups and marks the subject non-deletable', async () => {
    await subjects.save(makeSubject());
    await groups.save(makeGroup({ subjectId: MATH }));
    await groups.save(makeGroup({ subjectId: MATH }));
    await groups.save(makeGroup({ subjectId: MATH }));

    const [row] = await subjects.listWithUsage(CENTER);
    expect(row?.inUseCount).toBe(3);
    expect(row?.canDelete).toBe(false);
  });

  it('does not count a soft-deleted (tombstoned) group', async () => {
    await subjects.save(makeSubject());
    await groups.save(makeGroup({ subjectId: MATH }));
    const gone = makeGroup({ subjectId: MATH });
    await groups.save(gone);
    await groups.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);

    const [row] = await subjects.listWithUsage(CENTER);
    expect(row?.inUseCount).toBe(1);
    expect(row?.canDelete).toBe(false);
  });

  it('counts an inactive (active:false) but non-tombstoned group as in-use', async () => {
    // In-use is driven by `deletedAt`, never the `active` flag: a deactivated but
    // un-archived group still holds a live reference to the subject.
    await subjects.save(makeSubject());
    await groups.save(makeGroup({ subjectId: MATH, active: false, deletedAt: null }));

    const [row] = await subjects.listWithUsage(CENTER);
    expect(row?.inUseCount).toBe(1);
    expect(row?.canDelete).toBe(false);
  });

  it('counts each subject independently and excludes tombstoned subjects', async () => {
    await subjects.save(makeSubject({ id: MATH, name: { fr: 'Mathématiques', ar: 'الرياضيات' } }));
    await subjects.save(makeSubject({ id: PHYSICS, name: { fr: 'Physique', ar: 'الفيزياء' } }));
    const arabic = makeSubject({ id: ARABIC, name: { fr: 'Arabe', ar: 'العربية' } });
    await subjects.save(arabic);
    await subjects.softDelete(arabic.id, new Date('2026-08-02T00:00:00Z'), USER);

    await groups.save(makeGroup({ subjectId: MATH }));
    await groups.save(makeGroup({ subjectId: MATH }));
    await groups.save(makeGroup({ subjectId: PHYSICS }));

    const rows = await subjects.listWithUsage(CENTER);
    // Ordered by name_fr: Mathématiques, Physique. Tombstoned Arabe excluded.
    expect(rows.map((r) => [r.subject.id, r.inUseCount, r.canDelete])).toEqual([
      [MATH, 2, false],
      [PHYSICS, 1, false],
    ]);
  });

  it('is center-scoped: another center’s group does not count', async () => {
    await subjects.save(makeSubject());
    // A group in a different center must never leak into this center's usage — the
    // count is correlated on center_code, so this cross-tenant row is ignored.
    await groups.save(makeGroup({ subjectId: MATH, centerCode: OTHER_CENTER }));
    // One legitimate same-center group establishes the count.
    await groups.save(makeGroup({ subjectId: MATH }));

    const [row] = await subjects.listWithUsage(CENTER);
    expect(row?.inUseCount).toBe(1);

    // A different center's own subject is never returned for CENTER.
    await subjects.save(makeSubject({ id: PHYSICS, centerCode: OTHER_CENTER }));
    const ids = (await subjects.listWithUsage(CENTER)).map((r) => r.subject.id);
    expect(ids).toEqual([MATH]);
  });

  describe('references (SOU-135 named breakdown)', () => {
    it('names each referencing group by kind, id, and its level duplicated into fr/ar', async () => {
      await subjects.save(makeSubject());
      const group = makeGroup({ subjectId: MATH, level: '3ème Bac' });
      await groups.save(group);

      const [row] = await subjects.listWithUsage(CENTER);
      expect(row?.references).toEqual([
        { kind: 'group', id: group.id, label: { fr: '3ème Bac', ar: '3ème Bac' } },
      ]);
    });

    it('lists every referencing group, one entry per row, matching inUseCount', async () => {
      await subjects.save(makeSubject());
      const a = makeGroup({ subjectId: MATH, level: '1ère A' });
      const b = makeGroup({ subjectId: MATH, level: '2ème B' });
      await groups.save(a);
      await groups.save(b);

      const [row] = await subjects.listWithUsage(CENTER);
      expect(row?.references).toHaveLength(row?.inUseCount ?? -1);
      expect(row?.references.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('excludes a soft-deleted (tombstoned) group from the breakdown', async () => {
      await subjects.save(makeSubject());
      const gone = makeGroup({ subjectId: MATH });
      await groups.save(gone);
      await groups.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);

      const [row] = await subjects.listWithUsage(CENTER);
      expect(row?.references).toEqual([]);
    });

    it('is center-scoped: another center’s group never appears in the breakdown', async () => {
      await subjects.save(makeSubject());
      await groups.save(makeGroup({ subjectId: MATH, centerCode: OTHER_CENTER }));

      const [row] = await subjects.listWithUsage(CENTER);
      expect(row?.references).toEqual([]);
    });

    it('keeps each subject’s breakdown separate from another subject’s', async () => {
      await subjects.save(makeSubject({ id: MATH, name: { fr: 'Mathématiques', ar: 'الرياضيات' } }));
      await subjects.save(makeSubject({ id: PHYSICS, name: { fr: 'Physique', ar: 'الفيزياء' } }));
      const mathGroup = makeGroup({ subjectId: MATH, level: '1ère A' });
      const physGroup = makeGroup({ subjectId: PHYSICS, level: '2ème B' });
      await groups.save(mathGroup);
      await groups.save(physGroup);

      const rows = await subjects.listWithUsage(CENTER);
      const math = rows.find((r) => r.subject.id === MATH);
      const phys = rows.find((r) => r.subject.id === PHYSICS);
      expect(math?.references.map((r) => r.id)).toEqual([mathGroup.id]);
      expect(phys?.references.map((r) => r.id)).toEqual([physGroup.id]);
    });
  });
});

describe('SqliteGroupRepository.isSubjectInUse (SubjectReferencePort)', () => {
  it('is false when no live group references the subject', async () => {
    expect(await groups.isSubjectInUse(MATH)).toBe(false);
  });

  it('is true when at least one live group references the subject', async () => {
    await groups.save(makeGroup({ subjectId: MATH }));
    expect(await groups.isSubjectInUse(MATH)).toBe(true);
  });

  it('ignores a tombstoned group (the reference is freed on soft delete)', async () => {
    const group = makeGroup({ subjectId: MATH });
    await groups.save(group);
    await groups.softDelete(group.id, new Date('2026-08-02T00:00:00Z'), USER);
    expect(await groups.isSubjectInUse(MATH)).toBe(false);
  });

  it('is false for a different subject than the referenced one', async () => {
    await groups.save(makeGroup({ subjectId: MATH }));
    expect(await groups.isSubjectInUse(PHYSICS)).toBe(false);
  });

  it('is true for an inactive (active:false) but non-tombstoned group', async () => {
    // Live/archived lifecycle is `deletedAt`, not `active`: a deactivated group
    // that is not archived still references the subject.
    await groups.save(makeGroup({ subjectId: MATH, active: false, deletedAt: null }));
    expect(await groups.isSubjectInUse(MATH)).toBe(true);
  });
});
