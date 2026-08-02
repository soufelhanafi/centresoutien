import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { TeacherPayout, TeacherPayoutId, TeacherId, CenterCode, DeviceId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { loadMigrations, applyMigrations, runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteTeacherPayoutRepository } from '../../src/data/sqlite/repositories/teacher-payout-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_A = 'tch_00000000000000000000000001' as TeacherId;

let dir: string;
let db: DB;
let repo: SqliteTeacherPayoutRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pyo-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteTeacherPayoutRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-08-02T10:00:00Z');

let seq = 0;
function makePayout(over: Partial<TeacherPayout> = {}): TeacherPayout {
  seq += 1;
  return {
    id: `pyo_${String(seq).padStart(26, '0')}` as TeacherPayoutId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    teacherId: TEACHER_A,
    month: '2026-08',
    ruleKind: 'fixed-monthly',
    amountMad: 500000,
    baseAmountMad: null,
    percentSnapshot: null,
    status: 'draft',
    notes: null,
    ...over,
  };
}

describe('SqliteTeacherPayoutRepository', () => {
  it('round-trips a fixed-monthly payout with a null snapshot breakdown', async () => {
    const payout = makePayout();
    await repo.save(payout);
    expect(await repo.findById(payout.id)).toEqual(payout);
  });

  it('round-trips a percentage-of-monthly-fees payout with a non-null snapshot breakdown', async () => {
    const payout = makePayout({
      ruleKind: 'percentage-of-monthly-fees',
      amountMad: 30000,
      baseAmountMad: 100000,
      percentSnapshot: 30,
    });
    await repo.save(payout);
    expect(await repo.findById(payout.id)).toEqual(payout);
  });

  it('recomputes the snapshot in place on a second save (the compute-job re-run path)', async () => {
    const payout = makePayout({
      ruleKind: 'percentage-of-monthly-fees',
      amountMad: 30000,
      baseAmountMad: 100000,
      percentSnapshot: 30,
    });
    await repo.save(payout);
    await repo.save({ ...payout, amountMad: 45000, baseAmountMad: 150000, percentSnapshot: 30 });

    const found = await repo.findById(payout.id);
    expect(found).toMatchObject({ amountMad: 45000, baseAmountMad: 150000, percentSnapshot: 30 });
  });

  describe('migration replay from a prior schema version', () => {
    it('a device at 0026 (pre-snapshot) migrates cleanly to head and gains the two nullable columns', async () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-pyo-prior-'));
      const priorDb = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo26 = all.filter((m) => m.version <= 26);
        applyMigrations(priorDb, upTo26);
        priorDb
          .prepare(
            `INSERT INTO teacher_payouts
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                teacher_id, month, rule_kind, amount_mad, status, notes)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,NULL)`,
          )
          .run(
            'pyo_00000000000000000000000001',
            CENTER,
            DEVICE,
            AT.toISOString(),
            AT.toISOString(),
            USER,
            TEACHER_A,
            '2026-07',
            'fixed-monthly',
            500000,
            'draft',
          );

        const applied = applyMigrations(priorDb, all);
        expect(applied).toContain(27);

        const priorRepo = new SqliteTeacherPayoutRepository(priorDb);
        const row = await priorRepo.findById('pyo_00000000000000000000000001' as TeacherPayoutId);
        expect(row).toMatchObject({ baseAmountMad: null, percentSnapshot: null, amountMad: 500000 });
      } finally {
        priorDb.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
