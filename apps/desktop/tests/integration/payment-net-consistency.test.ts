import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  netPaidMad,
  type Invoice,
  type InvoiceId,
  type InvoiceLine,
  type InvoiceLineId,
  type FormulaId,
  type PaymentId,
  type StudentId,
  type CenterCode,
  type DeviceId,
  type UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';

// Deliberately does NOT run ensurePaymentReversalUniqueIndex, so a legacy double-void can
// be seeded by raw insert to prove every net surface dedups identically (SOU-233 #6/#11).

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT = 'pay_00000000000000000000000001' as PaymentId;
const DAY = '2026-08-10';
const AT = new Date('2026-08-10T10:00:00Z');

let dir: string;
let db: DB;
let payments: SqlitePaymentRepository;
let invoices: SqliteInvoiceRepository;

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

function issuedInvoice(): Invoice {
  return { id: INVOICE, ...envelope(), studentId: STUDENT, month: '2026-09', status: 'issued', issuedAt: AT, cancelledAt: null };
}

function line(amountMad: number): InvoiceLine {
  return {
    id: 'invl_00000000000000000000000001' as InvoiceLineId,
    ...envelope(),
    invoiceId: INVOICE,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
}

function rawInsertPayment(row: {
  id: string;
  kind: 'payment' | 'reversal';
  amountMad: number;
  reverses: string | null;
}): void {
  db.prepare(
    `INSERT INTO payments
       (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
        version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
     VALUES (@id, @c, @d, @t, @t, @u, NULL, 0, @inv, @kind, @amt, 'cash', @day, @rev, NULL)`,
  ).run({ id: row.id, c: CENTER, d: DEVICE, u: USER, t: AT.toISOString(), inv: INVOICE, kind: row.kind, amt: row.amountMad, day: DAY, rev: row.reverses });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pay-net-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  payments = new SqlitePaymentRepository(db);
  invoices = new SqliteInvoiceRepository(db);
  await invoices.createDraft(issuedInvoice(), [line(35000)]);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('deduped net is consistent across every SQL read surface (SOU-233 #6)', () => {
  it('reports the same net on balance, invoice list, overdue list, and day-takings for a double-void', async () => {
    // One 35000 payment, voided twice (a legacy offline double-void, equal amounts).
    rawInsertPayment({ id: PAYMENT, kind: 'payment', amountMad: 35000, reverses: null });
    rawInsertPayment({ id: 'pay_00000000000000000000000010', kind: 'reversal', amountMad: 35000, reverses: PAYMENT });
    rawInsertPayment({ id: 'pay_00000000000000000000000011', kind: 'reversal', amountMad: 35000, reverses: PAYMENT });

    const ledger = await payments.listForInvoice(INVOICE);
    const expected = netPaidMad(ledger); // reversed once → 0, never -35000
    expect(expected).toBe(0);

    // Balance check.
    expect(await payments.sumForInvoice(INVOICE)).toBe(expected);

    // Invoice list.
    const list = await invoices.listInvoices(CENTER, { month: '2026-09' });
    expect(list.rows.find((r) => r.invoice.id === INVOICE)?.netPaidMad).toBe(expected);

    // Overdue / issued list.
    const overdue = await invoices.listIssuedInvoiceLines(CENTER);
    expect(overdue.find((r) => r.invoiceId === INVOICE)?.netPaidMad).toBe(expected);

    // Day-takings.
    expect((await payments.getDayTakings(CENTER, DAY)).netMad).toBe(expected);
  });
});

describe('SQL tie-break matches the domain lower-ULID winner (SOU-233 #11)', () => {
  it('subtracts the LOWEST-id reversal amount when duplicate reversals differ', async () => {
    rawInsertPayment({ id: PAYMENT, kind: 'payment', amountMad: 35000, reverses: null });
    // Lower id → winner (amount 12000); higher id → loser (amount 35000, ignored).
    rawInsertPayment({ id: 'pay_00000000000000000000000010', kind: 'reversal', amountMad: 12000, reverses: PAYMENT });
    rawInsertPayment({ id: 'pay_00000000000000000000000011', kind: 'reversal', amountMad: 35000, reverses: PAYMENT });

    const ledger = await payments.listForInvoice(INVOICE);
    // 35000 − 12000 (winner's amount) = 23000, provably identical in SQL and domain.
    expect(netPaidMad(ledger)).toBe(23000);
    expect(await payments.sumForInvoice(INVOICE)).toBe(23000);
    expect(await payments.sumForInvoice(INVOICE)).toBe(netPaidMad(ledger));
  });
});
