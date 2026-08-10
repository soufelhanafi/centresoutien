import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Invoice,
  InvoiceId,
  Payment,
  PaymentId,
  PaymentKind,
  Student,
  StudentId,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';
import { SqliteStudentRepository } from '../../src/data/sqlite/repositories/student-repository';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const AT = new Date('2026-07-29T10:00:00Z');
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const INVOICE_A = 'inv_00000000000000000000000001' as InvoiceId;
const INVOICE_B = 'inv_00000000000000000000000002' as InvoiceId;

let dir: string;
let db: DB;
let invoiceRepo: SqliteInvoiceRepository;
let studentRepo: SqliteStudentRepository;
let paymentRepo: SqlitePaymentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-recent-pay-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  invoiceRepo = new SqliteInvoiceRepository(db);
  studentRepo = new SqliteStudentRepository(db);
  paymentRepo = new SqlitePaymentRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeStudent(over: Partial<Student> = {}): Student {
  return {
    id: STUDENT_A,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
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

function makeInvoice(id: InvoiceId, studentId: StudentId = STUDENT_A): Invoice {
  return {
    id,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId,
    month: '2026-05',
    status: 'issued',
    issuedAt: AT,
    cancelledAt: null,
  };
}

let paySeq = 0;
function makePayment(
  over: Partial<Payment> & { kind?: PaymentKind } = {},
): Payment {
  paySeq += 1;
  return {
    id: `pay_${String(paySeq).padStart(26, '0')}` as PaymentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId: INVOICE_A,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-10',
    reversesPaymentId: null,
    note: null,
    ...over,
  };
}

describe('SqlitePaymentRepository.listRecentPayments (RecentPaymentsReadPort)', () => {
  beforeEach(() => {
    paySeq = 0;
  });

  it('lists payments ACROSS invoices, most recent paidOn first, with the student label', async () => {
    await studentRepo.save(makeStudent());
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    await invoiceRepo.createDraft(makeInvoice(INVOICE_B), []);
    await paymentRepo.append(makePayment({ invoiceId: INVOICE_A, paidOn: '2026-08-01', amountMad: 20000 }));
    await paymentRepo.append(makePayment({ invoiceId: INVOICE_B, paidOn: '2026-08-09', amountMad: 15000 }));

    const rows = await paymentRepo.listRecentPayments(CENTER, { limit: 50 });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.invoiceId).toBe(INVOICE_B);
    expect(rows[0]?.paidOn).toBe('2026-08-09');
    expect(rows[0]?.studentName).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
    expect(rows[0]?.studentId).toBe(STUDENT_A);
    expect(rows[1]?.invoiceId).toBe(INVOICE_A);
  });

  it('includes reversal rows as-is (netting is the caller’s concern)', async () => {
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    const payment = makePayment({ invoiceId: INVOICE_A });
    await paymentRepo.append(payment);
    await paymentRepo.append(
      makePayment({ invoiceId: INVOICE_A, kind: 'reversal', reversesPaymentId: payment.id, paidOn: '2026-08-11' }),
    );

    const rows = await paymentRepo.listRecentPayments(CENTER, { limit: 50 });
    expect(rows.map((r) => r.kind).sort()).toEqual(['payment', 'reversal']);
  });

  it('applies the inclusive from/to day window', async () => {
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    await paymentRepo.append(makePayment({ paidOn: '2026-07-31' }));
    await paymentRepo.append(makePayment({ paidOn: '2026-08-10' }));
    await paymentRepo.append(makePayment({ paidOn: '2026-09-01' }));

    const rows = await paymentRepo.listRecentPayments(CENTER, {
      from: '2026-08-01',
      to: '2026-08-31',
      limit: 50,
    });

    expect(rows.map((r) => r.paidOn)).toEqual(['2026-08-10']);
  });

  it('filters to a single day when from === to', async () => {
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    await paymentRepo.append(makePayment({ paidOn: '2026-08-10' }));
    await paymentRepo.append(makePayment({ paidOn: '2026-08-11' }));

    const rows = await paymentRepo.listRecentPayments(CENTER, {
      from: '2026-08-10',
      to: '2026-08-10',
      limit: 50,
    });
    expect(rows.map((r) => r.paidOn)).toEqual(['2026-08-10']);
  });

  it('caps the result at the given limit', async () => {
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    await paymentRepo.append(makePayment({ paidOn: '2026-08-10' }));
    await paymentRepo.append(makePayment({ paidOn: '2026-08-11' }));
    await paymentRepo.append(makePayment({ paidOn: '2026-08-12' }));

    const rows = await paymentRepo.listRecentPayments(CENTER, { limit: 2 });
    expect(rows).toHaveLength(2);
    // Most recent first, so the two newest survive the cap.
    expect(rows.map((r) => r.paidOn)).toEqual(['2026-08-12', '2026-08-11']);
  });

  it('degrades to a null studentId/studentName when the invoice header has not synced yet', async () => {
    await paymentRepo.append(makePayment({ invoiceId: INVOICE_A }));

    const rows = await paymentRepo.listRecentPayments(CENTER, { limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentId).toBeNull();
    expect(rows[0]?.studentName).toBeNull();
  });

  it('never returns another center’s payments', async () => {
    await invoiceRepo.createDraft(makeInvoice(INVOICE_A), []);
    await paymentRepo.append(makePayment({ invoiceId: INVOICE_A }));
    await paymentRepo.append(makePayment({ centerCode: OTHER_CENTER, invoiceId: INVOICE_A }));

    const rows = await paymentRepo.listRecentPayments(CENTER, { limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.invoiceId === INVOICE_A)).toBe(true);
    expect(await paymentRepo.listRecentPayments(OTHER_CENTER, { limit: 50 })).toHaveLength(1);
  });

  it('returns an empty array for a center with no payments', async () => {
    expect(await paymentRepo.listRecentPayments(CENTER, { limit: 50 })).toEqual([]);
  });
});
