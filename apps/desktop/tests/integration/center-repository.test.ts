import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { Center, CenterId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteCenterRepository } from '../../src/data/sqlite/repositories/center-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let repo: SqliteCenterRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-center-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteCenterRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

function makeCenter(over: Partial<Center> = {}): Center {
  return {
    id: 'ctr_00000000000000000000000001' as CenterId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    name: 'Centre Al Ilm',
    address: '12 Rue Mohammed V',
    phone: '0522-000000',
    email: 'contact@alilm.ma',
    logoPath: null,
    plan: 'essentiel',
    ...over,
  };
}

describe('SqliteCenterRepository', () => {
  it('returns null before anything is saved', async () => {
    expect(await repo.get()).toBeNull();
  });

  it('round-trips the center through save + get with all fields intact', async () => {
    const center = makeCenter({ logoPath: 'logos/lgo_0001.png', plan: 'premium' });
    await repo.save(center);
    expect(await repo.get()).toEqual(center);
  });

  it('upsert updates mutable fields on a second save of the same id', async () => {
    await repo.save(makeCenter());
    await repo.save(
      makeCenter({
        name: 'Centre Renommé',
        email: '',
        logoPath: 'logos/lgo_0002.webp',
        plan: 'pro',
        version: 4,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.get();
    expect(found?.name).toBe('Centre Renommé');
    expect(found?.email).toBe('');
    expect(found?.logoPath).toBe('logos/lgo_0002.webp');
    expect(found?.plan).toBe('pro');
    expect(found?.version).toBe(4);
  });

  describe('listChangedSince (sync feed)', () => {
    it('returns the row when updated after the cursor, else empty', async () => {
      await repo.save(makeCenter({ updatedAt: new Date('2026-07-20T00:00:00Z') }));
      expect(await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'))).toHaveLength(1);
      expect(await repo.listChangedSince(new Date('2026-07-25T00:00:00Z'))).toHaveLength(0);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the ctr_ prefix (CHECK)', async () => {
      await expect(repo.save(makeCenter({ id: 'bad_00000000000000000000000001' as CenterId }))).rejects.toThrow();
    });

    it('rejects an unknown plan value (CHECK plan IN …)', async () => {
      await expect(
        // Cast through unknown — deliberately off-domain to prove the DB guard.
        repo.save(makeCenter({ plan: 'ultra' as unknown as Center['plan'] })),
      ).rejects.toThrow();
    });

    it('enforces one center row per DB file (singleton unique index)', () => {
      db.prepare(
        `INSERT INTO center (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name, address, phone, email, logo_path, plan, singleton)
         VALUES ('ctr_00000000000000000000000001','CS-CASA-001','dev_1','${AT.toISOString()}','${AT.toISOString()}','usr_1',NULL,0,'A','','','',NULL,'essentiel',1)`,
      ).run();
      expect(() =>
        db
          .prepare(
            `INSERT INTO center (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name, address, phone, email, logo_path, plan, singleton)
             VALUES ('ctr_00000000000000000000000002','CS-CASA-001','dev_1','${AT.toISOString()}','${AT.toISOString()}','usr_1',NULL,0,'B','','','',NULL,'essentiel',1)`,
          )
          .run(),
      ).toThrow();
    });
  });
});
