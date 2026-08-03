import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  Enrollment,
  EnrollmentId,
  Payment,
  PaymentId,
  Student,
  StudentId,
  GroupId,
  ParentId,
  CenterCode,
  DeviceId,
  FormulaId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';
import { SqliteStudentRepository } from '../../src/data/sqlite/repositories/student-repository';
import { SqliteEnrollmentRepository } from '../../src/data/sqlite/repositories/enrollment-repository';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const AT = new Date('2026-07-29T10:00:00Z');
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const GROUP_A = 'grp_00000000000000000000000001' as GroupId;
const PARENT_A = 'prt_00000000000000000000000001' as ParentId;
const PARENT_B = 'prt_00000000000000000000000002' as ParentId;

let dir: string;
let db: DB;
let invoiceRepo: SqliteInvoiceRepository;
let studentRepo: SqliteStudentRepository;
let enrollmentRepo: SqliteEnrollmentRepository;
let paymentRepo: SqlitePaymentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-overdue-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  invoiceRepo = new SqliteInvoiceRepository(db);
  studentRepo = new SqliteStudentRepository(db);
  enrollmentRepo = new SqliteEnrollmentRepository(db);
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
    guardianIds: [PARENT_A, PARENT_B],
    ...over,
  };
}

let invoiceSeq = 0;
function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  invoiceSeq += 1;
  return {
    id: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId: STUDENT_A,
    month: '2026-05',
    status: 'issued',
    issuedAt: AT,
    cancelledAt: null,
    ...over,
  };
}

let lineSeq = 0;
function makeLine(invoiceId: InvoiceId, amountMad: number): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
}

let enrollmentSeq = 0;
function makeEnrollment(studentId: StudentId, groupId: GroupId): Enrollment {
  enrollmentSeq += 1;
  return {
    id: `enr_${String(enrollmentSeq).padStart(26, '0')}` as EnrollmentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId,
    groupId,
    startMonth: '2026-01',
    endMonth: null,
  };
}

let paymentSeq = 0;
function makePayment(invoiceId: InvoiceId, amountMad: number): Payment {
  paymentSeq += 1;
  return {
    id: `pay_${String(paymentSeq).padStart(26, '0')}` as PaymentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId,
    kind: 'payment' as const,
    amountMad,
    method: 'cash' as const,
    paidOn: '2026-06-05',
    reversesPaymentId: null,
    note: null,
  };
}

describe('SqliteInvoiceRepository.listIssuedInvoiceLines (OverdueInvoiceViewReadPort)', () => {
  it('joins the student name, guardian ids, group ids, total, and net paid for an issued invoice', async () => {
    await studentRepo.save(makeStudent());
    await enrollmentRepo.save(makeEnrollment(STUDENT_A, GROUP_A));
    const invoice = makeInvoice();
    await invoiceRepo.createDraft(invoice, [makeLine(invoice.id, 20000), makeLine(invoice.id, 15000)]);
    await paymentRepo.append(makePayment(invoice.id, 10000));

    const rows = await invoiceRepo.listIssuedInvoiceLines(CENTER);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.invoiceId).toBe(invoice.id);
    expect(rows[0]?.month).toBe('2026-05');
    expect(rows[0]?.studentName).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
    expect(rows[0]?.guardianIds).toEqual([PARENT_A, PARENT_B]);
    expect(rows[0]?.groupIds).toEqual([GROUP_A]);
    expect(rows[0]?.totalMad).toBe(35000);
    expect(rows[0]?.netPaidMad).toBe(10000);
  });

  it('excludes draft and cancelled invoices — only issued debt is real', async () => {
    await studentRepo.save(makeStudent());
    const draft = makeInvoice({ status: 'draft', issuedAt: null });
    await invoiceRepo.createDraft(draft, [makeLine(draft.id, 10000)]);
    const cancelled = makeInvoice({ status: 'cancelled', cancelledAt: AT });
    await invoiceRepo.createDraft(cancelled, [makeLine(cancelled.id, 10000)]);

    const rows = await invoiceRepo.listIssuedInvoiceLines(CENTER);
    expect(rows).toEqual([]);
  });

  it('excludes a soft-deleted (discarded) invoice', async () => {
    await studentRepo.save(makeStudent());
    const invoice = makeInvoice();
    await invoiceRepo.createDraft(invoice, [makeLine(invoice.id, 10000)]);
    await invoiceRepo.softDelete(invoice.id, AT, USER);

    expect(await invoiceRepo.listIssuedInvoiceLines(CENTER)).toEqual([]);
  });

  it('degrades to a null studentName / empty guardianIds when the student has not synced yet', async () => {
    const invoice = makeInvoice(); // no matching student row saved
    await invoiceRepo.createDraft(invoice, [makeLine(invoice.id, 10000)]);

    const rows = await invoiceRepo.listIssuedInvoiceLines(CENTER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.studentName).toBeNull();
    expect(rows[0]?.guardianIds).toEqual([]);
    expect(rows[0]?.groupIds).toEqual([]);
  });

  it('excludes a student’s unenrolled (soft-deleted) group from groupIds', async () => {
    await studentRepo.save(makeStudent());
    const enrollment = makeEnrollment(STUDENT_A, GROUP_A);
    await enrollmentRepo.save(enrollment);
    await enrollmentRepo.softDelete(enrollment.id, AT, USER);
    const invoice = makeInvoice();
    await invoiceRepo.createDraft(invoice, [makeLine(invoice.id, 10000)]);

    const rows = await invoiceRepo.listIssuedInvoiceLines(CENTER);
    expect(rows[0]?.groupIds).toEqual([]);
  });

  it('never returns another center’s invoices', async () => {
    await studentRepo.save(makeStudent());
    const invoice = makeInvoice();
    await invoiceRepo.createDraft(invoice, [makeLine(invoice.id, 10000)]);

    expect(await invoiceRepo.listIssuedInvoiceLines(OTHER_CENTER)).toEqual([]);
  });

  it('returns an empty array for a center with no issued invoices', async () => {
    expect(await invoiceRepo.listIssuedInvoiceLines(CENTER)).toEqual([]);
  });
});
