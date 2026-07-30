import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Student,
  StudentId,
  ParentId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteStudentRepository } from '../../src/data/sqlite/repositories/student-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;

let dir: string;
let db: DB;
let repo: SqliteStudentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-stu-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteStudentRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeStudent(over: Partial<Student> = {}): Student {
  seq += 1;
  return {
    id: `stu_${String(seq).padStart(26, '0')}` as StudentId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    naturalKey: 'CS-CASA-001::yassinealaoui::2012-05-03',
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2012-05-03',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
    ...over,
  };
}

describe('SqliteStudentRepository', () => {
  it('round-trips a student through save + findById with all fields intact', async () => {
    const student = makeStudent({
      school: 'Lycée Ibn Sina',
      notes: 'Boursier',
      guardianIds: ['prt_00000000000000000000000001'] as ParentId[],
    });
    await repo.save(student);
    expect(await repo.findById(student.id)).toEqual(student);
  });

  it('round-trips an empty guardian array and null optionals', async () => {
    const student = makeStudent();
    await repo.save(student);
    const found = await repo.findById(student.id);
    expect(found?.guardianIds).toEqual([]);
    expect(found?.school).toBeNull();
    expect(found?.notes).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('stu_00000000000000000000000099' as StudentId)).toBeNull();
  });

  it('upsert updates mutable fields but not identity on a second save', async () => {
    const student = makeStudent();
    await repo.save(student);
    await repo.save(
      makeStudent({
        id: student.id,
        naturalKey: 'MUST-BE-IGNORED',
        level: 'Bac',
        school: 'Nouvelle école',
        guardianIds: ['prt_00000000000000000000000002'] as ParentId[],
        version: 4,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(student.id);
    expect(found?.level).toBe('Bac');
    expect(found?.school).toBe('Nouvelle école');
    expect(found?.guardianIds).toEqual(['prt_00000000000000000000000002']);
    expect(found?.version).toBe(4);
    // natural_key is immutable — the upsert never rewrites it.
    expect(found?.naturalKey).toBe('CS-CASA-001::yassinealaoui::2012-05-03');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const student = makeStudent();
    await repo.save(student);
    await repo.softDelete(student.id, new Date('2026-08-02T00:00:00Z'), 'usr_00000000000000000000000001' as UserId);

    expect(await repo.findById(student.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeStudent({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeStudent({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((s) => s.id)).toEqual([later.id]);
    });
  });

  describe('findByNaturalKey', () => {
    it('returns every live match in the center and excludes tombstones + other centers', async () => {
      const key = 'CS-CASA-001::same::2012-05-03';
      const a = makeStudent({ naturalKey: key });
      const b = makeStudent({ naturalKey: key });
      const gone = makeStudent({ naturalKey: key });
      await repo.save(a);
      await repo.save(b);
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, 'usr_00000000000000000000000001' as UserId);
      await repo.save(makeStudent({ naturalKey: key, centerCode: OTHER_CENTER }));

      const matches = await repo.findByNaturalKey(CENTER, key);
      expect(matches.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe('countActive', () => {
    it('counts only live students in the given center', async () => {
      await repo.save(makeStudent());
      const gone = makeStudent();
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, 'usr_00000000000000000000000001' as UserId);
      await repo.save(makeStudent({ centerCode: OTHER_CENTER }));

      expect(await repo.countActive(CENTER)).toBe(1);
      expect(await repo.countActive(OTHER_CENTER)).toBe(1);
    });
  });

  describe('listActive', () => {
    it('returns only live students of the center, ordered by French name', async () => {
      await repo.save(makeStudent({ name: { fr: 'Zaid', ar: 'زيد' }, naturalKey: 'k-zaid' }));
      await repo.save(makeStudent({ name: { fr: 'amine', ar: 'أمين' }, naturalKey: 'k-amine' }));
      const gone = makeStudent({ name: { fr: 'Bilal', ar: 'بلال' }, naturalKey: 'k-bilal' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, 'usr_00000000000000000000000001' as UserId);
      await repo.save(makeStudent({ centerCode: OTHER_CENTER, naturalKey: 'k-other' }));

      const rows = await repo.listActive(CENTER);
      expect(rows.map((s) => s.name.fr)).toEqual(['amine', 'Zaid']);
    });
  });

  describe('listByGuardian', () => {
    const DAD = 'prt_00000000000000000000000001' as ParentId;
    const MUM = 'prt_00000000000000000000000002' as ParentId;

    it('returns live students whose guardian_ids include the parent (JSON1 json_each), tenant-scoped', async () => {
      await repo.save(
        makeStudent({ name: { fr: 'Zaid', ar: 'زيد' }, naturalKey: 'k-zaid', guardianIds: [DAD] as ParentId[] }),
      );
      await repo.save(
        makeStudent({ name: { fr: 'Amine', ar: 'أمين' }, naturalKey: 'k-amine', guardianIds: [DAD, MUM] as ParentId[] }),
      );
      // Linked to MUM only — excluded for DAD.
      await repo.save(
        makeStudent({ name: { fr: 'Nadia', ar: 'نادية' }, naturalKey: 'k-nadia', guardianIds: [MUM] as ParentId[] }),
      );
      // Archived child of DAD — excluded.
      const gone = makeStudent({ name: { fr: 'Bilal', ar: 'بلال' }, naturalKey: 'k-bilal', guardianIds: [DAD] as ParentId[] });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, 'usr_00000000000000000000000001' as UserId);
      // Same guardian id in another center — excluded by tenant scope.
      await repo.save(
        makeStudent({ centerCode: OTHER_CENTER, naturalKey: 'k-other', guardianIds: [DAD] as ParentId[] }),
      );

      const rows = await repo.listByGuardian(CENTER, DAD);
      expect(rows.map((s) => s.name.fr)).toEqual(['Amine', 'Zaid']);
    });

    it('returns an empty array for a guardian with no linked children', async () => {
      await repo.save(makeStudent({ guardianIds: [] }));
      expect(await repo.listByGuardian(CENTER, DAD)).toEqual([]);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the stu_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeStudent({ id: 'bad_00000000000000000000000001' as StudentId })),
      ).rejects.toThrow();
    });
  });
});
