import { describe, it, expect } from 'vitest';
import {
  detectReversalDedups,
  netPaidMadDeduped,
  reversalDedupKey,
  PAYMENT_ENTITY_TYPE,
} from '../../../src/sync/reversal-dedup';
import { netPaidMad } from '../../../src/policies/payment-status';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Payment, PaymentId } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const ORIGINAL = 'pay_00000000000000000000000001' as PaymentId;

function payment(id: string, over: Partial<Payment> = {}): Payment {
  return {
    id: id as PaymentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-05',
    reversesPaymentId: null,
    note: null,
    ...over,
  };
}

function reversal(id: string, reverses: PaymentId, over: Partial<Payment> = {}): Payment {
  return payment(id, { kind: 'reversal', reversesPaymentId: reverses, ...over });
}

describe('detectReversalDedups', () => {
  it('returns nothing when a payment is reversed at most once', () => {
    const ledger = [payment(ORIGINAL), reversal('pay_00000000000000000000000002', ORIGINAL)];
    expect(detectReversalDedups(ledger)).toEqual([]);
  });

  it('flags two offline reversals of the same payment, keeping the lower ULID', () => {
    // Two devices each voided ORIGINAL offline; their reversals collide only at merge.
    const lower = 'pay_00000000000000000000000010' as PaymentId;
    const higher = 'pay_00000000000000000000000011' as PaymentId;
    const ledger = [payment(ORIGINAL), reversal(higher, ORIGINAL), reversal(lower, ORIGINAL)];

    const dedups = detectReversalDedups(ledger);
    expect(dedups).toHaveLength(1);
    expect(dedups[0]).toMatchObject({
      entityType: PAYMENT_ENTITY_TYPE,
      reversesPaymentId: ORIGINAL,
      winnerId: lower,
      loserId: higher,
    });
  });

  it('emits one dedup per extra reversal when three collide', () => {
    const ledger = [
      payment(ORIGINAL),
      reversal('pay_00000000000000000000000012', ORIGINAL),
      reversal('pay_00000000000000000000000010', ORIGINAL),
      reversal('pay_00000000000000000000000011', ORIGINAL),
    ];
    const dedups = detectReversalDedups(ledger);
    expect(dedups.map((d) => d.loserId)).toEqual([
      'pay_00000000000000000000000011',
      'pay_00000000000000000000000012',
    ]);
    expect(new Set(dedups.map((d) => d.winnerId))).toEqual(
      new Set(['pay_00000000000000000000000010']),
    );
  });

  it('does not conflate reversals of different payments', () => {
    const other = 'pay_00000000000000000000000009' as PaymentId;
    const ledger = [
      payment(ORIGINAL),
      payment(other),
      reversal('pay_00000000000000000000000010', ORIGINAL),
      reversal('pay_00000000000000000000000011', other),
    ];
    expect(detectReversalDedups(ledger)).toEqual([]);
  });

  it('ignores tombstoned rows', () => {
    const ledger = [
      payment(ORIGINAL),
      reversal('pay_00000000000000000000000010', ORIGINAL),
      reversal('pay_00000000000000000000000011', ORIGINAL, {
        deletedAt: new Date('2026-08-06T00:00:00Z'),
      }),
    ];
    expect(detectReversalDedups(ledger)).toEqual([]);
  });
});

describe('reversalDedupKey', () => {
  it('is stable and distinct per collision', () => {
    const [dedup] = detectReversalDedups([
      payment(ORIGINAL),
      reversal('pay_00000000000000000000000011', ORIGINAL),
      reversal('pay_00000000000000000000000010', ORIGINAL),
    ]);
    expect(reversalDedupKey(dedup!)).toBe(
      'reversal-dedup:pay_00000000000000000000000001:pay_00000000000000000000000010:pay_00000000000000000000000011',
    );
  });
});

describe('netPaidMadDeduped', () => {
  it('matches netPaidMad when there is no double-void', () => {
    const ledger = [payment(ORIGINAL), reversal('pay_00000000000000000000000002', ORIGINAL)];
    expect(netPaidMadDeduped(ledger)).toBe(netPaidMad(ledger));
    expect(netPaidMadDeduped(ledger)).toBe(0);
  });

  it('ignores tombstoned rows in the net', () => {
    const ledger = [
      payment(ORIGINAL), // +20000
      payment('pay_00000000000000000000000020', {
        amountMad: 5000,
        deletedAt: new Date('2026-08-06T00:00:00Z'),
      }),
    ];
    expect(netPaidMadDeduped(ledger)).toBe(20000);
  });

  it('counts a double-voided payment as reversed once, never driving net negative', () => {
    const ledger = [
      payment(ORIGINAL), // +20000
      reversal('pay_00000000000000000000000010', ORIGINAL), // -20000 (winner)
      reversal('pay_00000000000000000000000011', ORIGINAL), // duplicate, ignored
    ];
    // netPaidMad itself now dedups (SOU-233): a naive sum would be -20000; the winning
    // (lowest-id) reversal is counted once, so the net collapses to 0, never negative.
    expect(netPaidMad(ledger)).toBe(0);
    expect(netPaidMadDeduped(ledger)).toBe(0);
  });

  it('keeps the lowest-id reversal amount when duplicate reversals differ (tie-break)', () => {
    const ledger = [
      payment(ORIGINAL, { amountMad: 20000 }), // +20000
      reversal('pay_00000000000000000000000010', ORIGINAL, { amountMad: 12000 }), // winner (lowest id)
      reversal('pay_00000000000000000000000011', ORIGINAL, { amountMad: 20000 }), // loser, ignored
    ];
    // The winner is chosen by id, and its amount (12000) is the one subtracted.
    expect(netPaidMad(ledger)).toBe(8000);
  });
});
