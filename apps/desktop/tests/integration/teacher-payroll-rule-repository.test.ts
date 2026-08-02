import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  TeacherPayrollRule,
  TeacherPayrollRuleId,
  TeacherId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqliteTeacherPayrollRuleRepository } from '../../src/data/sqlite/repositories/teacher-payroll-rule-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_A = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_B = 'tch_00000000000000000000000002' as TeacherId;

let dir: string;
let db: DB;
let repo: SqliteTeacherPayrollRuleRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pyr-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteTeacherPayrollRuleRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-08-02T10:00:00Z');

let seq = 0;
function makeFixedRule(over: Partial<TeacherPayrollRule> = {}): TeacherPayrollRule {
  seq += 1;
  return {
    id: `pyr_${String(seq).padStart(26, '0')}` as TeacherPayrollRuleId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    teacherId: TEACHER_A,
    kind: 'fixed-monthly',
    amountMad: 300000,
    startMonth: '2026-09',
    endMonth: null,
    ...over,
  } as TeacherPayrollRule;
}

function makePercentageRule(over: Partial<TeacherPayrollRule> = {}): TeacherPayrollRule {
  seq += 1;
  return {
    id: `pyr_${String(seq).padStart(26, '0')}` as TeacherPayrollRuleId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    teacherId: TEACHER_A,
    kind: 'percentage-of-monthly-fees',
    percent: 30,
    startMonth: '2026-09',
    endMonth: null,
    ...over,
  } as TeacherPayrollRule;
}

describe('SqliteTeacherPayrollRuleRepository', () => {
  it('round-trips a fixed-monthly rule through save + findById with all fields intact', async () => {
    const rule = makeFixedRule({ amountMad: 450000, startMonth: '2026-09', endMonth: '2027-06' });
    await repo.save(rule);
    expect(await repo.findById(rule.id)).toEqual(rule);
  });

  it('round-trips a percentage-of-monthly-fees rule through save + findById with all fields intact', async () => {
    const rule = makePercentageRule({ percent: 25 });
    await repo.save(rule);
    expect(await repo.findById(rule.id)).toEqual(rule);
  });

  it('round-trips an open-ended endMonth (null) as still-active', async () => {
    const rule = makeFixedRule({ endMonth: null });
    await repo.save(rule);
    expect((await repo.findById(rule.id))?.endMonth).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('pyr_00000000000000000000000099' as TeacherPayrollRuleId)).toBeNull();
  });

  it('upsert caps end_month + version but never rewrites identity on a second save (the close path)', async () => {
    const rule = makeFixedRule();
    await repo.save(rule);
    await repo.save(
      makeFixedRule({
        id: rule.id,
        endMonth: '2026-12',
        version: 4,
        updatedAt: new Date('2026-12-15T09:00:00Z'),
        updatedBy: 'usr_00000000000000000000000002' as UserId,
      }),
    );
    const found = await repo.findById(rule.id);
    expect(found?.endMonth).toBe('2026-12');
    expect(found?.version).toBe(4);
    expect(found?.updatedBy).toBe('usr_00000000000000000000000002');
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.teacherId).toBe(TEACHER_A);
    expect(found?.deviceOrigin).toBe(DEVICE);
  });

  it('softDelete hides the row from findById + listLiveByTeacher but keeps it as a tombstone in the sync feed', async () => {
    const rule = makeFixedRule();
    await repo.save(rule);
    await repo.softDelete(rule.id, new Date('2026-08-03T00:00:00Z'), USER);

    expect(await repo.findById(rule.id)).toBeNull();
    expect(await repo.listLiveByTeacher(TEACHER_A)).toHaveLength(0);
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-03T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listLiveByTeacher', () => {
    it('returns the teacher live rules newest start first, excluding tombstones + other teachers', async () => {
      await repo.save(makeFixedRule({ startMonth: '2026-09', endMonth: '2026-12' }));
      await repo.save(makePercentageRule({ startMonth: '2027-01' }));
      const gone = makeFixedRule({ startMonth: '2025-09', endMonth: '2025-12' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeFixedRule({ teacherId: TEACHER_B, startMonth: '2026-09' }));

      const rows = await repo.listLiveByTeacher(TEACHER_A);
      expect(rows.map((r) => r.startMonth)).toEqual(['2027-01', '2026-09']);
    });
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeFixedRule({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      await repo.save(makePercentageRule({ updatedAt: new Date('2026-07-20T00:00:00Z') }));

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.updatedAt).toEqual(new Date('2026-07-20T00:00:00Z'));
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the pyr_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeFixedRule({ id: 'pay_00000000000000000000000001' as TeacherPayrollRuleId })),
      ).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      await expect(
        repo.save(makeFixedRule({ kind: 'hourly' as TeacherPayrollRule['kind'] })),
      ).rejects.toThrow();
    });

    it('rejects a fixed-monthly rule with a non-positive amount (CHECK)', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO teacher_payroll_rules
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                teacher_id, kind, amount_mad, percent, start_month, end_month)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,?,NULL,?,NULL)`,
          )
          .run(
            'pyr_00000000000000000000000009',
            CENTER,
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            TEACHER_A,
            'fixed-monthly',
            0,
            '2026-09',
          ),
      ).toThrow();
    });

    it('rejects a percentage rule above 100 (CHECK)', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO teacher_payroll_rules
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                teacher_id, kind, amount_mad, percent, start_month, end_month)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,NULL,?,?,NULL)`,
          )
          .run(
            'pyr_00000000000000000000000009',
            CENTER,
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            TEACHER_A,
            'percentage-of-monthly-fees',
            101,
            '2026-09',
          ),
      ).toThrow();
    });

    it('rejects a fixed-monthly row that also carries a percent value (mutual-exclusivity CHECK)', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO teacher_payroll_rules
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                teacher_id, kind, amount_mad, percent, start_month, end_month)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,NULL)`,
          )
          .run(
            'pyr_00000000000000000000000009',
            CENTER,
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            TEACHER_A,
            'fixed-monthly',
            300000,
            30,
            '2026-09',
          ),
      ).toThrow();
    });

    it('rejects a percentage row with a NULL percent (mutual-exclusivity CHECK)', () => {
      expect(() =>
        db
          .prepare(
            `INSERT INTO teacher_payroll_rules
               (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
                teacher_id, kind, amount_mad, percent, start_month, end_month)
             VALUES (?,?,?,?,?,?,NULL,0,?,?,NULL,NULL,?,NULL)`,
          )
          .run(
            'pyr_00000000000000000000000009',
            CENTER,
            'dev_1',
            AT.toISOString(),
            AT.toISOString(),
            'usr_1',
            TEACHER_A,
            'percentage-of-monthly-fees',
            '2026-09',
          ),
      ).toThrow();
    });
  });

  describe('migration replay from a prior schema version', () => {
    it('a device at 0023 (pre-payroll-rules) migrates cleanly to head and gains the table', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-pyr-prior-'));
      const priorDb = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo23 = all.filter((m) => m.version <= 23);
        applyMigrations(priorDb, upTo23);
        expect(
          priorDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_payroll_rules'")
            .all(),
        ).toEqual([]);

        const applied = applyMigrations(priorDb, all);
        expect(applied).toContain(24);
        expect(
          priorDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_payroll_rules'")
            .all(),
        ).toHaveLength(1);
      } finally {
        priorDb.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
