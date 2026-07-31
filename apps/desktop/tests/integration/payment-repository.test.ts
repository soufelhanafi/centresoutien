import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  netPaidMad,
  type Payment,
  type PaymentId,
  type PaymentKind,
  type InvoiceId,
  type CenterCode,
  type DeviceId,
  type UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const DEVICE_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEVICE_B = 'dev_0000000000000000000000000B' as DeviceId;
const INVOICE_A = 'inv_00000000000000000000000001' as InvoiceId;
const PAYMENT_A = 'pay_00000000000000000000000001' as PaymentId;

let dir: string;
let db: DB;
let repo: SqlitePaymentRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pay-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqlitePaymentRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-08-05T10:00:00Z');

let seq = 0;
function makePayment(over: Partial<Payment> & { kind?: PaymentKind } = {}): Payment {
  seq += 1;
  return {
    id: `pay_${String(seq).padStart(26, '0')}` as PaymentId,
    centerCode: CENTER,
    deviceOrigin: DEVICE_A,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId: INVOICE_A,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-05',
    reversesPaymentId: null,
    ...over,
  };
}

describe('SqlitePaymentRepository', () => {
  it('round-trips a payment through append + findById with all fields intact', async () => {
    const payment = makePayment({ id: PAYMENT_A, method: 'cheque', version: 3 });
    await repo.append(payment);
    expect(await repo.findById(PAYMENT_A)).toEqual(payment);
  });

  it('round-trips a reversal referencing its original', async () => {
    const reversal = makePayment({
      kind: 'reversal',
      reversesPaymentId: PAYMENT_A,
      method: 'cheque',
    });
    await repo.append(reversal);
    const found = await repo.findById(reversal.id);
    expect(found?.kind).toBe('reversal');
    expect(found?.reversesPaymentId).toBe(PAYMENT_A);
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('pay_00000000000000000000000099' as PaymentId)).toBeNull();
  });

  it('is append-only: re-appending an existing id fails', async () => {
    const payment = makePayment({ id: PAYMENT_A });
    await repo.append(payment);
    await expect(repo.append(payment)).rejects.toThrow();
  });

  describe('listForInvoice + sumForInvoice', () => {
    it('lists an invoice’s live rows oldest-id first and sums net = Σpayments − Σreversals', async () => {
      const p1 = makePayment({ amountMad: 20000 });
      const p2 = makePayment({ amountMad: 15000 });
      const rev = makePayment({ kind: 'reversal', amountMad: 15000, reversesPaymentId: p2.id });
      await repo.append(p1);
      await repo.append(p2);
      await repo.append(rev);

      const ledger = await repo.listForInvoice(INVOICE_A);
      expect(ledger).toHaveLength(3);
      // SQL sum must agree with the pure policy over the same rows.
      expect(await repo.sumForInvoice(INVOICE_A)).toBe(20000);
      expect(await repo.sumForInvoice(INVOICE_A)).toBe(netPaidMad(ledger));
    });

    it('sums to 0 for an invoice with no payments', async () => {
      expect(await repo.sumForInvoice('inv_00000000000000000000000077' as InvoiceId)).toBe(0);
    });

    it('scopes to one invoice', async () => {
      await repo.append(makePayment({ invoiceId: INVOICE_A, amountMad: 20000 }));
      await repo.append(
        makePayment({ invoiceId: 'inv_00000000000000000000000002' as InvoiceId, amountMad: 99000 }),
      );
      expect(await repo.sumForInvoice(INVOICE_A)).toBe(20000);
    });
  });

  describe('append-only triggers (safety net)', () => {
    it('rejects a direct UPDATE on a payment row', async () => {
      await repo.append(makePayment({ id: PAYMENT_A }));
      expect(() =>
        db.prepare('UPDATE payments SET amount_mad = 999 WHERE id = ?').run(PAYMENT_A),
      ).toThrow();
    });

    it('rejects a direct DELETE on a payment row', async () => {
      await repo.append(makePayment({ id: PAYMENT_A }));
      expect(() => db.prepare('DELETE FROM payments WHERE id = ?').run(PAYMENT_A)).toThrow();
      // The row survives the blocked delete.
      expect(await repo.findById(PAYMENT_A)).not.toBeNull();
    });

    it('rejects even a soft-delete UPDATE (deleted_at) — payments are never tombstoned', async () => {
      await repo.append(makePayment({ id: PAYMENT_A }));
      expect(() =>
        db.prepare('UPDATE payments SET deleted_at = ? WHERE id = ?').run(AT.toISOString(), PAYMENT_A),
      ).toThrow();
    });
  });

  describe('DB constraints', () => {
    it('rejects a payment id without the pay_ prefix (CHECK)', async () => {
      await expect(repo.append(makePayment({ id: 'bad_1' as PaymentId }))).rejects.toThrow();
    });

    it('rejects an unknown kind (CHECK)', async () => {
      await expect(repo.append(makePayment({ kind: 'refund' as PaymentKind }))).rejects.toThrow();
    });

    it('rejects an unknown method (CHECK)', async () => {
      await expect(
        repo.append(makePayment({ method: 'bitcoin' as Payment['method'] })),
      ).rejects.toThrow();
    });

    it('rejects a negative amount (CHECK)', async () => {
      await expect(repo.append(makePayment({ amountMad: -1 }))).rejects.toThrow();
    });

    it('rejects a payment that references another payment (CHECK)', async () => {
      await expect(
        repo.append(makePayment({ kind: 'payment', reversesPaymentId: PAYMENT_A })),
      ).rejects.toThrow();
    });

    it('rejects a reversal with no reference (CHECK)', async () => {
      await expect(
        repo.append(makePayment({ kind: 'reversal', reversesPaymentId: null })),
      ).rejects.toThrow();
    });
  });

  describe('sync union (two devices, one invoice)', () => {
    it('stores both devices’ concurrent payments — union, no conflict', async () => {
      await repo.append(makePayment({ deviceOrigin: DEVICE_A, amountMad: 20000 }));
      await repo.append(makePayment({ deviceOrigin: DEVICE_B, amountMad: 15000 }));
      const ledger = await repo.listForInvoice(INVOICE_A);
      expect(ledger).toHaveLength(2);
      expect(await repo.sumForInvoice(INVOICE_A)).toBe(35000);
    });
  });

  describe('listChangedSince (sync feed)', () => {
    it('returns rows written strictly after the cursor', async () => {
      await repo.append(makePayment({ updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repo.append(makePayment({ updatedAt: new Date('2026-08-20T00:00:00Z') }));
      const changed = await repo.listChangedSince(new Date('2026-08-10T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.updatedAt).toEqual(new Date('2026-08-20T00:00:00Z'));
    });
  });

  describe('migration replay', () => {
    it('applies 0019 cleanly on a DB already migrated to 0018', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-pay-replay-'));
      const stale = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo18 = all.filter((m) => m.version <= 18);
        applyMigrations(stale, upTo18);
        expect(() => stale.prepare('SELECT 1 FROM payments LIMIT 1').get()).toThrow();

        const applied = applyMigrations(stale, all);
        expect(applied).toContain(19);
        expect(stale.prepare('SELECT COUNT(*) AS n FROM payments').get()).toEqual({ n: 0 });
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
