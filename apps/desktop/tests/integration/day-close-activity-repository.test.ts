import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { CenterCode } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteDayCloseActivityRepository } from '../../src/data/sqlite/repositories/day-close-activity-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DAY = '2026-08-10';

let dir: string;
let db: DB;
let repo: SqliteDayCloseActivityRepository;
let seq = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-day-close-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteDayCloseActivityRepository(db);
  seq = 0;
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function id(prefix: string): string {
  seq += 1;
  return `${prefix}_${String(seq).padStart(26, '0')}`;
}

type SubOver = { center?: CenterCode; kind?: string; createdAt?: string; deletedAt?: string | null };
function insertSubscription(over: SubOver = {}): void {
  db.prepare(
    `INSERT INTO student_subscriptions
      (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
       student_id, formula_id, kind, subject_ids, start_month, end_month)
     VALUES (@id, @center, 'dev_x', @createdAt, @createdAt, 'usr_x', @deletedAt, 0,
       @student, @formula, @kind, '[]', '2026-08', NULL)`,
  ).run({
    id: id('sbs'),
    center: over.center ?? CENTER,
    createdAt: `${over.createdAt ?? DAY}T09:00:00.000Z`,
    deletedAt: over.deletedAt ?? null,
    student: id('stu'),
    formula: id('fml'),
    kind: over.kind ?? 'regular',
  });
}

type EnrOver = { center?: CenterCode; createdAt?: string; deletedAt?: string | null };
function insertEnrollment(over: EnrOver = {}): void {
  db.prepare(
    `INSERT INTO enrollments
      (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
       student_id, group_id, start_month, end_month)
     VALUES (@id, @center, 'dev_x', @createdAt, @createdAt, 'usr_x', @deletedAt, 0,
       @student, @group, '2026-08', NULL)`,
  ).run({
    id: id('enr'),
    center: over.center ?? CENTER,
    createdAt: `${over.createdAt ?? DAY}T09:00:00.000Z`,
    deletedAt: over.deletedAt ?? null,
    student: id('stu'),
    group: id('grp'),
  });
}

type InvOver = {
  center?: CenterCode;
  status?: string;
  issuedAt?: string | null;
  deletedAt?: string | null;
  lineAmounts?: readonly number[];
};
function insertInvoice(over: InvOver = {}): void {
  const invoiceId = id('inv');
  const issuedAt =
    over.issuedAt === undefined ? `${DAY}T10:00:00.000Z` : over.issuedAt;
  db.prepare(
    `INSERT INTO invoices
      (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
       student_id, month, status, issued_at, cancelled_at)
     VALUES (@id, @center, 'dev_x', @createdAt, @createdAt, 'usr_x', @deletedAt, 0,
       @student, '2026-08', @status, @issuedAt, NULL)`,
  ).run({
    id: invoiceId,
    center: over.center ?? CENTER,
    createdAt: `${DAY}T08:00:00.000Z`,
    deletedAt: over.deletedAt ?? null,
    student: id('stu'),
    status: over.status ?? 'issued',
    issuedAt,
  });
  for (const amount of over.lineAmounts ?? [20000]) {
    db.prepare(
      `INSERT INTO invoice_lines
        (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
         invoice_id, formula_id, label_fr, label_ar, kind, amount_mad)
       VALUES (@id, @center, 'dev_x', @createdAt, @createdAt, 'usr_x', NULL, 0,
         @invoice, @formula, 'Math', 'رياضيات', 'regular', @amount)`,
    ).run({
      id: id('invl'),
      center: over.center ?? CENTER,
      createdAt: `${DAY}T08:00:00.000Z`,
      invoice: invoiceId,
      formula: id('fml'),
      amount,
    });
  }
}

describe('SqliteDayCloseActivityRepository', () => {
  it('counts new subscriptions split by kind for the day', async () => {
    insertSubscription({ kind: 'regular' });
    insertSubscription({ kind: 'regular' });
    insertSubscription({ kind: 'exam-prep' });
    insertSubscription({ kind: 'regular', createdAt: '2026-08-09' }); // other day

    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts.newSubscriptions).toEqual({ regular: 2, examPrep: 1, total: 3 });
  });

  it('counts enrollments created on the day', async () => {
    insertEnrollment();
    insertEnrollment();
    insertEnrollment({ createdAt: '2026-08-11' }); // other day

    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts.studentsEnrolled).toBe(2);
  });

  it('counts issued invoices and sums their billed lines', async () => {
    insertInvoice({ lineAmounts: [20000, 5000] }); // 25000
    insertInvoice({ lineAmounts: [30000] }); // 30000
    insertInvoice({ status: 'draft', issuedAt: null }); // excluded (not issued)
    insertInvoice({ issuedAt: `2026-08-11T10:00:00.000Z` }); // excluded (other day)

    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts.invoicesGenerated).toEqual({ count: 2, totalBilledMad: 55000 });
  });

  it('excludes soft-deleted rows from every count', async () => {
    insertSubscription({ deletedAt: '2026-08-11T00:00:00.000Z' });
    insertEnrollment({ deletedAt: '2026-08-11T00:00:00.000Z' });
    insertInvoice({ deletedAt: '2026-08-11T00:00:00.000Z' });

    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts.newSubscriptions.total).toBe(0);
    expect(counts.studentsEnrolled).toBe(0);
    expect(counts.invoicesGenerated).toEqual({ count: 0, totalBilledMad: 0 });
  });

  it('never crosses a center boundary', async () => {
    insertSubscription({ center: CENTER });
    insertSubscription({ center: OTHER_CENTER });
    insertEnrollment({ center: OTHER_CENTER });
    insertInvoice({ center: OTHER_CENTER });

    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts.newSubscriptions.total).toBe(1);
    expect(counts.studentsEnrolled).toBe(0);
    expect(counts.invoicesGenerated.count).toBe(0);
  });

  it('returns all-zero counts for a day with no activity', async () => {
    const counts = await repo.getDayCloseActivity(CENTER, { from: DAY, to: DAY });

    expect(counts).toEqual({
      newSubscriptions: { regular: 0, examPrep: 0, total: 0 },
      studentsEnrolled: 0,
      invoicesGenerated: { count: 0, totalBilledMad: 0 },
    });
  });

  it('spans an inclusive multi-day window (range-generic)', async () => {
    insertSubscription({ createdAt: '2026-08-09' });
    insertSubscription({ createdAt: '2026-08-10' });
    insertSubscription({ createdAt: '2026-08-11' });
    insertSubscription({ createdAt: '2026-08-12' }); // outside

    const counts = await repo.getDayCloseActivity(CENTER, { from: '2026-08-09', to: '2026-08-11' });

    expect(counts.newSubscriptions.total).toBe(3);
  });
});
