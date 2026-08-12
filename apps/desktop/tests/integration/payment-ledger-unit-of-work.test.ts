import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  PLANS,
  PlanPolicy,
  RecordPayment,
  VoidPayment,
  PaymentExceedsBalanceError,
  PaymentAlreadyReversedError,
  netPaidMad,
  type Clock,
  type IdGenerator,
  type Invoice,
  type InvoiceId,
  type InvoiceLine,
  type InvoiceLineId,
  type FormulaId,
  type Payment,
  type PaymentId,
  type StudentId,
  type CenterCode,
  type DeviceId,
  type UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';
import { SqlitePaymentLedgerUnitOfWork } from '../../src/data/sqlite/repositories/payment-ledger-unit-of-work';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT = 'pay_00000000000000000000000001' as PaymentId;
const AT = new Date('2026-08-10T10:00:00Z');

const clock: Clock = { now: () => AT };

function freshIds(seed = 100): IdGenerator {
  let n = seed;
  return {
    next: <T extends string = string>(prefix: string) =>
      `${prefix}_${String(n++).padStart(26, '0')}` as T,
  };
}

function envelope() {
  return {
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
  };
}

function makeInvoice(): Invoice {
  return { id: INVOICE, ...envelope(), studentId: STUDENT, month: '2026-09', status: 'issued', issuedAt: AT, cancelledAt: null };
}

function makeLine(amountMad: number): InvoiceLine {
  return {
    id: 'invl_00000000000000000000000001' as InvoiceLineId,
    ...envelope(),
    invoiceId: INVOICE,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    kind: 'regular',
    amountMad,
  };
}

function makePayment(id: string, over: Partial<Payment> = {}): Payment {
  return {
    id: id as PaymentId,
    ...envelope(),
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad: 35000,
    method: 'cash',
    paidOn: '2026-08-10',
    reversesPaymentId: null,
    note: null,
    ...over,
  };
}

let dir: string;
let db: DB;
let payments: SqlitePaymentRepository;
let invoices: SqliteInvoiceRepository;
let ledger: SqlitePaymentLedgerUnitOfWork;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pay-uow-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  payments = new SqlitePaymentRepository(db);
  invoices = new SqliteInvoiceRepository(db);
  ledger = new SqlitePaymentLedgerUnitOfWork(db);
  await invoices.createDraft(makeInvoice(), [makeLine(35000)]);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function recordPayment(seed = 100): RecordPayment {
  return new RecordPayment(payments, invoices, clock, freshIds(seed), new PlanPolicy(PLANS.essentiel), ledger);
}
function voidPayment(seed = 200): VoidPayment {
  return new VoidPayment(payments, clock, freshIds(seed), new PlanPolicy(PLANS.essentiel), ledger);
}

function baseRecordInput() {
  return {
    invoiceId: INVOICE as string,
    amountMad: 35000,
    method: 'cash',
    paidOn: '2026-08-10',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

describe('migration 0042 — partial unique reversal index', () => {
  it('rejects a second reversal of the same payment (raw insert)', async () => {
    await payments.append(makePayment(PAYMENT));
    await payments.append(
      makePayment('pay_00000000000000000000000010', {
        kind: 'reversal',
        reversesPaymentId: PAYMENT,
      }),
    );
    // A second reversal of the SAME payment trips ux_payments_reversal_once.
    await expect(
      payments.append(
        makePayment('pay_00000000000000000000000011', {
          kind: 'reversal',
          reversesPaymentId: PAYMENT,
        }),
      ),
    ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
  });

  it('allows reversing two different payments', async () => {
    const other = 'pay_00000000000000000000000002' as PaymentId;
    await payments.append(makePayment(PAYMENT));
    await payments.append(makePayment(other, { invoiceId: INVOICE }));
    await payments.append(
      makePayment('pay_00000000000000000000000010', { kind: 'reversal', reversesPaymentId: PAYMENT }),
    );
    await expect(
      payments.append(
        makePayment('pay_00000000000000000000000011', { kind: 'reversal', reversesPaymentId: other }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('SqlitePaymentLedgerUnitOfWork — atomic balance guard (SOU-233)', () => {
  it('lets exactly one of two racing full payments succeed, net never overshoots', async () => {
    const results = await Promise.allSettled([
      recordPayment(100).execute(baseRecordInput()),
      recordPayment(200).execute(baseRecordInput()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PaymentExceedsBalanceError);

    const ledgerRows = await payments.listForInvoice(INVOICE);
    expect(ledgerRows.filter((p) => p.kind === 'payment')).toHaveLength(1);
    expect(await payments.sumForInvoice(INVOICE)).toBe(35000);
    expect(await payments.sumForInvoice(INVOICE)).toBe(netPaidMad(ledgerRows));
  });

  it('derives the authoritative status from the in-transaction net', async () => {
    const { status } = await recordPayment().execute(baseRecordInput());
    expect(status).toBe('paid');
  });
});

describe('SqlitePaymentLedgerUnitOfWork — atomic reversal guard (SOU-233)', () => {
  it('lets exactly one of two racing voids succeed, mapping the collision to PaymentAlreadyReversedError', async () => {
    await payments.append(makePayment(PAYMENT, { amountMad: 35000 }));

    const voidInput = { paymentId: PAYMENT as string, centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER };
    const results = await Promise.allSettled([
      voidPayment(300).execute(voidInput),
      voidPayment(400).execute(voidInput),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PaymentAlreadyReversedError);

    const ledgerRows = await payments.listForInvoice(INVOICE);
    expect(ledgerRows.filter((p) => p.kind === 'reversal')).toHaveLength(1);
    // Net is exactly 0 (one payment, one reversal) — never negative.
    expect(await payments.sumForInvoice(INVOICE)).toBe(0);
  });
});
