import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Parent,
  ParentId,
  PhoneNumber,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteParentRepository } from '../../src/data/sqlite/repositories/parent-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteParentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-parent-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteParentRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

function makeParent(over: Partial<Parent> = {}): Parent {
  return {
    id: 'prt_00000000000000000000000001' as ParentId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    naturalKey: 'CS-CASA-001::ahmed-benali::+212612345678',
    name: 'Ahmed Benali',
    phone: '+212612345678' as PhoneNumber,
    email: 'ahmed@benali.ma',
    relation: 'pere',
    whatsappOptIn: true,
    ...over,
  };
}

describe('SqliteParentRepository', () => {
  it('round-trips a parent through save + findById with all fields intact', async () => {
    const parent = makeParent();
    await repo.save(parent);
    expect(await repo.findById(parent.id)).toEqual(parent);
  });

  it('stores a null email as null', async () => {
    await repo.save(makeParent({ id: 'prt_00000000000000000000000009' as ParentId, email: null, naturalKey: 'nk-null-email' }));
    const found = await repo.findById('prt_00000000000000000000000009' as ParentId);
    expect(found?.email).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('prt_00000000000000000000000099' as ParentId)).toBeNull();
  });

  it('findByNaturalKey returns the live matching parent, null once soft-deleted', async () => {
    const parent = makeParent();
    await repo.save(parent);
    expect(await repo.findByNaturalKey(parent.naturalKey)).toEqual(parent);

    await repo.softDelete(parent.id, new Date('2026-08-02T00:00:00Z'));
    expect(await repo.findByNaturalKey(parent.naturalKey)).toBeNull();
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeParent());
    await repo.save(
      makeParent({
        name: 'Ahmed B.',
        relation: 'tuteur',
        whatsappOptIn: false,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById('prt_00000000000000000000000001' as ParentId);
    expect(found?.name).toBe('Ahmed B.');
    expect(found?.relation).toBe('tuteur');
    expect(found?.whatsappOptIn).toBe(false);
    expect(found?.version).toBe(3);
  });

  it('softDelete hides the row from findById but keeps it as a tombstone in the sync feed', async () => {
    const parent = makeParent();
    await repo.save(parent);
    await repo.softDelete(parent.id, new Date('2026-08-02T00:00:00Z'));

    expect(await repo.findById(parent.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  describe('shared family phone', () => {
    it('allows two guardians with the same phone but different natural keys', async () => {
      await repo.save(makeParent({ id: 'prt_00000000000000000000000001' as ParentId, name: 'Ahmed Benali', naturalKey: 'CS-CASA-001::ahmed-benali::+212612345678' }));
      await repo.save(makeParent({ id: 'prt_00000000000000000000000002' as ParentId, name: 'Salma Benali', naturalKey: 'CS-CASA-001::salma-benali::+212612345678', relation: 'mere' }));

      expect(await repo.findById('prt_00000000000000000000000001' as ParentId)).not.toBeNull();
      expect(await repo.findById('prt_00000000000000000000000002' as ParentId)).not.toBeNull();
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the prt_ prefix (CHECK)', async () => {
      await expect(repo.save(makeParent({ id: 'bad_00000000000000000000000001' as ParentId }))).rejects.toThrow();
    });

    it('rejects an unknown relation token (CHECK relation IN (...))', async () => {
      await expect(
        repo.save(makeParent({ id: 'prt_00000000000000000000000003' as ParentId, naturalKey: 'nk3', relation: 'oncle' as Parent['relation'] })),
      ).rejects.toThrow();
    });

    it('blocks a duplicate live natural key in one center (partial UNIQUE index)', async () => {
      await repo.save(makeParent({ id: 'prt_00000000000000000000000001' as ParentId }));
      await expect(
        repo.save(makeParent({ id: 'prt_00000000000000000000000002' as ParentId })), // same naturalKey
      ).rejects.toThrow();
    });

    it('permits recreation of a soft-deleted natural key (partial index skips tombstones)', async () => {
      const first = makeParent({ id: 'prt_00000000000000000000000001' as ParentId });
      await repo.save(first);
      await repo.softDelete(first.id, new Date('2026-08-02T00:00:00Z'));

      await expect(
        repo.save(makeParent({ id: 'prt_00000000000000000000000002' as ParentId })), // same naturalKey, alive
      ).resolves.toBeUndefined();
    });
  });
});
