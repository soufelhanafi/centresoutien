import { describe, it, expect } from 'vitest';
import { newEnvelope } from '../../../src/entities/envelope';
import { derivePaymentStatus, netPaidMad } from '../../../src/policies/payment-status';
import { detectProbableDoubleEntry } from '../../../src/policies/payment-duplicate';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { fakeClock } from '../fakes/clock';

/**
 * SOU-93 "Done when": two devices' concurrent payments on one invoice must **union**
 * without conflict. Payments are append-only with globally-unique ULIDs, so there is no
 * shared editable scalar to clash on — the merge is a set union and the status is
 * re-derived over it. This test simulates that at the ledger level (the sync engine's
 * job is just to carry the rows; there is nothing to resolve).
 */
const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEVICE_B = 'dev_0000000000000000000000000B' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const clock = fakeClock('2026-08-05T09:00:00Z');

function payment(id: string, deviceOrigin: DeviceId, updatedBy: UserId, amountMad: number): Payment {
  return {
    id: id as PaymentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin, updatedBy }, clock),
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad,
    method: 'cash',
    paidOn: '2026-08-05',
    reversesPaymentId: null,
  };
}

describe('payment sync union', () => {
  it('unions two devices’ distinct payments on one invoice; status derives over the union', async () => {
    // Laptop A took 200 MAD, laptop B took 150 MAD, both offline, for a 350 MAD invoice.
    const fromA = payment('pay_0000000000000000000000000A', DEVICE_A, USER_A, 20000);
    const fromB = payment('pay_0000000000000000000000000B', DEVICE_B, USER_B, 15000);

    // The merged replica after sync holds BOTH rows — no overwrite, no rejected push.
    const merged = new InMemoryPaymentRepository();
    await merged.append(fromA);
    await merged.append(fromB);

    const ledger = await merged.listForInvoice(INVOICE);
    expect(ledger).toHaveLength(2);
    expect(netPaidMad(ledger)).toBe(35000);
    expect(await merged.sumForInvoice(INVOICE)).toBe(35000);
    // Independent payments on the same invoice are NOT double-entries (different amounts).
    expect(detectProbableDoubleEntry(fromB, ledger)).toEqual([]);
    // Derived over the union: the invoice is settled.
    expect(derivePaymentStatus(35000, ledger)).toBe('paid');
  });

  it('flags identical cross-device rows as a probable double-entry (not auto-merged)', async () => {
    // Same 200 MAD, same day, same invoice, keyed on both laptops — the one real conflict.
    const fromA = payment('pay_0000000000000000000000001A', DEVICE_A, USER_A, 20000);
    const fromB = payment('pay_0000000000000000000000001B', DEVICE_B, USER_B, 20000);

    const merged = new InMemoryPaymentRepository();
    await merged.append(fromA);
    await merged.append(fromB);
    const ledger = await merged.listForInvoice(INVOICE);

    // Both rows still union (no data lost); the duplicate is surfaced for the admin (SOU-91),
    // never silently merged — a center can legitimately take two identical cash payments.
    expect(ledger).toHaveLength(2);
    expect(detectProbableDoubleEntry(fromB, ledger)).toEqual([fromA]);
  });
});
