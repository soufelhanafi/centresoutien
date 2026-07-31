import { describe, it, expect } from 'vitest';
import {
  detectProbableDoubleEntry,
  detectDuplicateReversals,
} from '../../../src/policies/payment-duplicate';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Payment, PaymentId, PaymentKind } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE_A = 'dev_00000000000000000000000001' as DeviceId;
const DEVICE_B = 'dev_00000000000000000000000002' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const OTHER_INVOICE = 'inv_00000000000000000000000002' as InvoiceId;
const clock = fakeClock('2026-08-01T10:00:00Z');

let seq = 0;
function makePayment(over: Partial<Payment> & { kind?: PaymentKind } = {}): Payment {
  seq += 1;
  return {
    id: `pay_${String(seq).padStart(26, '0')}` as PaymentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE_A, updatedBy: USER }, clock),
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad: 20000,
    method: 'cash',
    paidOn: '2026-08-01',
    reversesPaymentId: null,
    ...over,
  };
}

describe('detectProbableDoubleEntry', () => {
  it('flags a same-invoice, same-amount, same-day payment from another device', () => {
    // The classic case: the same cash payment keyed in on two laptops before a sync.
    const onDeviceA = makePayment({ deviceOrigin: DEVICE_A });
    const onDeviceB = makePayment({ deviceOrigin: DEVICE_B });
    expect(detectProbableDoubleEntry(onDeviceB, [onDeviceA, onDeviceB])).toEqual([onDeviceA]);
  });

  it('excludes the candidate itself by id', () => {
    const p = makePayment();
    expect(detectProbableDoubleEntry(p, [p])).toEqual([]);
  });

  it('does not flag a different amount', () => {
    const candidate = makePayment({ amountMad: 20000 });
    const existing = makePayment({ amountMad: 15000 });
    expect(detectProbableDoubleEntry(candidate, [existing])).toEqual([]);
  });

  it('does not flag a different day', () => {
    const candidate = makePayment({ paidOn: '2026-08-01' });
    const existing = makePayment({ paidOn: '2026-08-02' });
    expect(detectProbableDoubleEntry(candidate, [existing])).toEqual([]);
  });

  it('does not flag a payment on a different invoice', () => {
    const candidate = makePayment({ invoiceId: INVOICE });
    const existing = makePayment({ invoiceId: OTHER_INVOICE });
    expect(detectProbableDoubleEntry(candidate, [existing])).toEqual([]);
  });

  it('ignores reversals — a reversal is never a double-entry', () => {
    const candidate = makePayment();
    const reversal = makePayment({
      kind: 'reversal',
      reversesPaymentId: 'pay_00000000000000000000000099' as PaymentId,
    });
    expect(detectProbableDoubleEntry(candidate, [reversal])).toEqual([]);
  });

  it('ignores tombstoned rows', () => {
    const candidate = makePayment();
    const deleted = makePayment({ deletedAt: new Date('2026-08-02T00:00:00Z') });
    expect(detectProbableDoubleEntry(candidate, [deleted])).toEqual([]);
  });
});

const ORIGINAL = 'pay_00000000000000000000000099' as PaymentId;

function makeReversal(over: Partial<Payment> = {}): Payment {
  return makePayment({ kind: 'reversal', reversesPaymentId: ORIGINAL, ...over });
}

describe('detectDuplicateReversals', () => {
  it('flags two reversals that void the same payment from different devices', () => {
    // Two laptops void the same payment while offline; each appends a distinct reversal.
    const onDeviceA = makeReversal({ deviceOrigin: DEVICE_A });
    const onDeviceB = makeReversal({ deviceOrigin: DEVICE_B });
    expect(detectDuplicateReversals(onDeviceB, [onDeviceA, onDeviceB])).toEqual([onDeviceA]);
  });

  it('excludes the candidate itself by id', () => {
    const r = makeReversal();
    expect(detectDuplicateReversals(r, [r])).toEqual([]);
  });

  it('does not flag reversals of a different original payment', () => {
    const candidate = makeReversal({ reversesPaymentId: ORIGINAL });
    const other = makeReversal({
      reversesPaymentId: 'pay_00000000000000000000000098' as PaymentId,
    });
    expect(detectDuplicateReversals(candidate, [other])).toEqual([]);
  });

  it('never flags a plain payment — only reversals carry a target', () => {
    const candidate = makeReversal();
    const payment = makePayment();
    expect(detectDuplicateReversals(candidate, [payment])).toEqual([]);
  });

  it('returns [] when the candidate is a plain payment (null target)', () => {
    const candidate = makePayment();
    const reversal = makeReversal();
    expect(detectDuplicateReversals(candidate, [reversal])).toEqual([]);
  });

  it('ignores tombstoned reversals', () => {
    const candidate = makeReversal();
    const deleted = makeReversal({ deletedAt: new Date('2026-08-02T00:00:00Z') });
    expect(detectDuplicateReversals(candidate, [deleted])).toEqual([]);
  });
});
