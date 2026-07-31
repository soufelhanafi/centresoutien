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
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteStudentSubscriptionRepository } from '../../src/data/sqlite/repositories/student-subscription-repository';
import { SqliteStudentSubscriptionReference } from '../../src/data/sqlite/repositories/student-subscription-reference';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const FORMULA_ID = 'fml_00000000000000000000000003' as FormulaId;
const MATH = 'sub_00000000000000000000000004' as SubjectId;
const PHYS = 'sub_00000000000000000000000005' as SubjectId;
const SVT = 'sub_00000000000000000000000006' as SubjectId;

let dir: string;
let db: DB;
let repo: SqliteStudentSubscriptionRepository;
let reference: SqliteStudentSubscriptionReference;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-subref-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteStudentSubscriptionRepository(db);
  reference = new SqliteStudentSubscriptionReference(repo);
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
    studentId: STUDENT,
    formulaId: FORMULA_ID,
    kind: 'regular',
    subjectIds: [MATH, PHYS],
    startMonth: '2026-09',
    endMonth: null,
    ...over,
  };
}

describe('SqliteStudentSubscriptionReference.activeCoverage', () => {
  it('returns the covering subscription kind when a live subscription includes the subject in the month', async () => {
    await repo.save(makeSubscription({ kind: 'regular', subjectIds: [MATH, PHYS] }));
    expect(await reference.activeCoverage(STUDENT, MATH, '2026-10')).toEqual({ kind: 'regular' });
  });

  it('returns the exam-prep kind for an exam-prep bundle', async () => {
    await repo.save(makeSubscription({ kind: 'exam-prep', subjectIds: [MATH] }));
    expect(await reference.activeCoverage(STUDENT, MATH, '2026-10')).toEqual({ kind: 'exam-prep' });
  });

  it('returns null when no live subscription covers the subject', async () => {
    await repo.save(makeSubscription({ subjectIds: [MATH, PHYS] }));
    expect(await reference.activeCoverage(STUDENT, SVT, '2026-10')).toBeNull();
  });

  it('returns null when the covering subscription is not active in the month', async () => {
    await repo.save(makeSubscription({ startMonth: '2026-09', endMonth: '2026-12' }));
    expect(await reference.activeCoverage(STUDENT, MATH, '2027-03')).toBeNull();
  });

  it('returns null once the covering subscription is soft-deleted (tombstones do not cover)', async () => {
    const sub = makeSubscription({ subjectIds: [MATH] });
    await repo.save(sub);
    expect(await reference.activeCoverage(STUDENT, MATH, '2026-10')).toEqual({ kind: 'regular' });
    await repo.softDelete(sub.id, new Date('2026-08-01T00:00:00Z'), USER);
    expect(await reference.activeCoverage(STUDENT, MATH, '2026-10')).toBeNull();
  });

  describe('prefer-kind when both tracks cover the subject', () => {
    beforeEach(async () => {
      // exam-prep starts LATER, so `listLiveByStudent` (ORDER BY start_month DESC)
      // returns it first — proving the result is kind-driven, not order-driven.
      await repo.save(makeSubscription({ kind: 'exam-prep', subjectIds: [MATH], startMonth: '2026-10' }));
      await repo.save(makeSubscription({ kind: 'regular', subjectIds: [MATH, PHYS], startMonth: '2026-09' }));
    });

    it('returns regular when regular is preferred, despite exam-prep sorting first', async () => {
      expect(await reference.activeCoverage(STUDENT, MATH, '2026-11', 'regular')).toEqual({
        kind: 'regular',
      });
    });

    it('returns exam-prep when exam-prep is preferred', async () => {
      expect(await reference.activeCoverage(STUDENT, MATH, '2026-11', 'exam-prep')).toEqual({
        kind: 'exam-prep',
      });
    });

    it('falls back to the first covering subscription (by start_month DESC) when no kind is preferred', async () => {
      expect(await reference.activeCoverage(STUDENT, MATH, '2026-11')).toEqual({ kind: 'exam-prep' });
    });
  });
});
