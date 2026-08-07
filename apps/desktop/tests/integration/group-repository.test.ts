import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Group,
  GroupId,
  CenterCode,
  DeviceId,
  EntityId,
  SubjectId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteGroupRepository } from '../../src/data/sqlite/repositories/group-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;

let dir: string;
let db: DB;
let repo: SqliteGroupRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-grp-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteGroupRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeGroup(over: Partial<Group> = {}): Group {
  seq += 1;
  return {
    id: `grp_${String(seq).padStart(26, '0')}` as GroupId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    subjectId: SUBJECT_ID,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...over,
  };
}

describe('SqliteGroupRepository', () => {
  it('round-trips a group through save + findById with all fields intact', async () => {
    const group = makeGroup({
      level: '1ère Bac',
      capacity: 12,
      kind: 'exam-prep',
      teacherId: 'tch_00000000000000000000000009' as EntityId,
    });
    await repo.save(group);
    expect(await repo.findById(group.id)).toEqual(group);
  });

  it('round-trips a null teacherId (unassigned group)', async () => {
    const group = makeGroup({ teacherId: null });
    await repo.save(group);
    expect((await repo.findById(group.id))?.teacherId).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('grp_00000000000000000000000099' as GroupId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const group = makeGroup();
    await repo.save(group);
    await repo.save(
      makeGroup({
        id: group.id,
        level: 'Tronc Commun',
        capacity: 30,
        kind: 'exam-prep',
        teacherId: 'tch_00000000000000000000000009' as EntityId,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(group.id);
    expect(found?.level).toBe('Tronc Commun');
    expect(found?.capacity).toBe(30);
    expect(found?.kind).toBe('exam-prep');
    expect(found?.teacherId).toBe('tch_00000000000000000000000009');
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe('dev_00000000000000000000000001');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const group = makeGroup();
    await repo.save(group);
    await repo.softDelete(group.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(group.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeGroup({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeGroup({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((g) => g.id)).toEqual([later.id]);
    });
  });

  describe('listActive', () => {
    it('returns only live groups of the center, ordered by level, excluding tombstones + other centers', async () => {
      await repo.save(makeGroup({ level: 'Tronc Commun' }));
      await repo.save(makeGroup({ level: '1ère Bac' }));
      const gone = makeGroup({ level: '2ème Bac' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeGroup({ level: '1ère Bac', centerCode: OTHER_CENTER }));

      const active = await repo.listActive(CENTER);
      expect(active.map((g) => g.level)).toEqual(['1ère Bac', 'Tronc Commun']);
    });
  });

  describe('listArchived', () => {
    it('returns only tombstoned groups of the center, ordered by level', async () => {
      await repo.save(makeGroup({ level: 'Live' }));
      const g1 = makeGroup({ level: 'Terminale' });
      const g2 = makeGroup({ level: 'Première' });
      await repo.save(g1);
      await repo.save(g2);
      await repo.softDelete(g1.id, AT, USER);
      await repo.softDelete(g2.id, AT, USER);

      const archived = await repo.listArchived(CENTER);
      expect(archived.map((g) => g.level)).toEqual(['Première', 'Terminale']);
    });
  });

  describe('findArchivedById', () => {
    it('returns a tombstoned row and null for a live or unknown id', async () => {
      const live = makeGroup();
      await repo.save(live);
      expect(await repo.findArchivedById(live.id)).toBeNull(); // live → not archived

      const gone = makeGroup();
      await repo.save(gone);
      await repo.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);
      const found = await repo.findArchivedById(gone.id);
      expect(found?.id).toBe(gone.id);
      expect(found?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));

      expect(await repo.findArchivedById('grp_00000000000000000000000099' as GroupId)).toBeNull();
    });

    it('round-trips a restore: clear deleted_at via save, then the row is live again', async () => {
      const group = makeGroup();
      await repo.save(group);
      await repo.softDelete(group.id, new Date('2026-08-02T00:00:00Z'), USER);

      const archived = await repo.findArchivedById(group.id);
      expect(archived).not.toBeNull();
      await repo.save({ ...(archived as Group), deletedAt: null, updatedAt: new Date('2026-08-03T00:00:00Z') });

      expect(await repo.findById(group.id)).not.toBeNull();
      expect(await repo.findArchivedById(group.id)).toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the grp_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeGroup({ id: 'bad_00000000000000000000000001' as GroupId })),
      ).rejects.toThrow();
    });

    it('rejects a capacity below 1 (CHECK)', async () => {
      await expect(repo.save(makeGroup({ capacity: 0 }))).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      await expect(
        repo.save(makeGroup({ kind: 'bootcamp' as Group['kind'] })),
      ).rejects.toThrow();
    });

    it('round-trips the active flag as a boolean', async () => {
      const group = makeGroup({ active: true });
      await repo.save(group);
      expect((await repo.findById(group.id))?.active).toBe(true);
    });
  });
});
