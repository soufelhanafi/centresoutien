import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  StudentSubscription,
  StudentSubscriptionId,
  StudentId,
  FormulaId,
  SubjectId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { loadMigrations, applyMigrations, runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteStudentSubscriptionRepository } from '../../src/data/sqlite/repositories/student-subscription-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;
const FORMULA_ID = 'fml_00000000000000000000000003' as FormulaId;
const MATH = 'sub_00000000000000000000000004' as SubjectId;
const PHYS = 'sub_00000000000000000000000005' as SubjectId;

let dir: string;
let db: DB;
let repo: SqliteStudentSubscriptionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-sub-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteStudentSubscriptionRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeSubscription(over: Partial<StudentSubscription> = {}): StudentSubscription {
  seq += 1;
  return {
    id: `sbs_${String(seq).padStart(26, '0')}` as StudentSubscriptionId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId: STUDENT_A,
    formulaId: FORMULA_ID,
    kind: 'regular',
    subjectIds: [MATH, PHYS],
    startMonth: '2026-09',
    endMonth: null,
    ...over,
  };
}

describe('SqliteStudentSubscriptionRepository', () => {
  it('round-trips a subscription through save + findById with all fields (subjectIds JSON) intact', async () => {
    const subscription = makeSubscription({
      kind: 'exam-prep',
      subjectIds: [MATH],
      startMonth: '2026-09',
      endMonth: '2027-06',
    });
    await repo.save(subscription);
    expect(await repo.findById(subscription.id)).toEqual(subscription);
  });

  it('round-trips an open-ended endMonth (null) as still-active', async () => {
    const subscription = makeSubscription({ endMonth: null });
    await repo.save(subscription);
    expect((await repo.findById(subscription.id))?.endMonth).toBeNull();
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('sbs_00000000000000000000000099' as StudentSubscriptionId)).toBeNull();
  });

  it('upsert caps end_month + version but never rewrites identity on a second save (the close path)', async () => {
    const subscription = makeSubscription();
    await repo.save(subscription);
    await repo.save(
      makeSubscription({
        id: subscription.id,
        endMonth: '2026-12',
        version: 4,
        updatedAt: new Date('2026-12-15T09:00:00Z'),
        updatedBy: 'usr_00000000000000000000000002' as UserId,
      }),
    );
    const found = await repo.findById(subscription.id);
    expect(found?.endMonth).toBe('2026-12');
    expect(found?.version).toBe(4);
    expect(found?.updatedBy).toBe('usr_00000000000000000000000002');
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.studentId).toBe(STUDENT_A);
    expect(found?.deviceOrigin).toBe(DEVICE);
  });

  it('softDelete hides the row from findById + active reads but keeps it as a tombstone in the sync feed', async () => {
    const subscription = makeSubscription();
    await repo.save(subscription);
    await repo.softDelete(subscription.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(subscription.id)).toBeNull();
    expect(await repo.listLiveByStudent(STUDENT_A)).toHaveLength(0);
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listLiveByStudent', () => {
    it('returns the student live subscriptions newest start first, excluding tombstones + other students', async () => {
      await repo.save(makeSubscription({ startMonth: '2026-09' }));
      await repo.save(makeSubscription({ startMonth: '2027-01' }));
      const gone = makeSubscription({ startMonth: '2025-09' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSubscription({ studentId: STUDENT_B, startMonth: '2026-09' }));

      const rows = await repo.listLiveByStudent(STUDENT_A);
      expect(rows.map((r) => r.startMonth)).toEqual(['2027-01', '2026-09']);
    });
  });

  describe('listLiveByStudentAndKind', () => {
    it('returns only the requested track for the student, excluding tombstones', async () => {
      await repo.save(makeSubscription({ kind: 'regular' }));
      await repo.save(makeSubscription({ kind: 'exam-prep', subjectIds: [MATH] }));
      const gone = makeSubscription({ kind: 'regular' });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);

      const regular = await repo.listLiveByStudentAndKind(STUDENT_A, 'regular');
      expect(regular).toHaveLength(1);
      expect(regular[0]?.kind).toBe('regular');
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the sbs_ prefix (CHECK) — and Subject-style sub_ is not accepted', async () => {
      await expect(
        repo.save(makeSubscription({ id: 'sub_00000000000000000000000001' as StudentSubscriptionId })),
      ).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      await expect(
        repo.save(makeSubscription({ kind: 'bootcamp' as StudentSubscription['kind'] })),
      ).rejects.toThrow();
    });
  });

  describe('migration replay from a prior schema version', () => {
    it('a device at 0015 (pre-subscriptions) migrates cleanly to head and gains the table', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-sub-prior-'));
      const priorDb = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo15 = all.filter((m) => m.version <= 15);
        applyMigrations(priorDb, upTo15);
        expect(
          priorDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='student_subscriptions'")
            .all(),
        ).toEqual([]);

        // Now the app updates: applying the full chain adds only the pending 0017.
        const applied = applyMigrations(priorDb, all);
        expect(applied).toContain(17);
        expect(
          priorDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='student_subscriptions'")
            .all(),
        ).toHaveLength(1);
      } finally {
        priorDb.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
