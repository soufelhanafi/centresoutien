import { describe, it, expect } from 'vitest';
import {
  netPaidMad,
  paymentStatusOf,
  derivePaymentStatus,
  type PaymentStatus,
} from '../../../src/policies/payment-status';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Payment, PaymentId, PaymentKind, PaymentMethod } from '../../../src/entities/payment';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;
const clock = fakeClock('2026-08-01T10:00:00Z');

let seq = 0;
function makePayment(
  kind: PaymentKind,
  amountMad: number,
  over: Partial<Payment> = {},
): Payment {
  seq += 1;
  return {
    id: `pay_${String(seq).padStart(26, '0')}` as PaymentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    invoiceId: INVOICE,
    kind,
    amountMad,
    method: 'cash' as PaymentMethod,
    paidOn: '2026-08-01',
    reversesPaymentId: kind === 'reversal' ? ('pay_00000000000000000000000000' as PaymentId) : null,
    ...over,
  };
}

describe('netPaidMad', () => {
  it('is 0 for no payments', () => {
    expect(netPaidMad([])).toBe(0);
  });

  it('sums payments and subtracts reversals', () => {
    const payments = [
      makePayment('payment', 20000),
      makePayment('payment', 15000),
      makePayment('reversal', 15000),
    ];
    expect(netPaidMad(payments)).toBe(20000);
  });

  it('can go negative when over-reversed (the derivation clamps, not this)', () => {
    expect(netPaidMad([makePayment('reversal', 5000)])).toBe(-5000);
  });
});

describe('paymentStatusOf', () => {
  const cases: { name: string; total: number; net: number; expected: PaymentStatus }[] = [
    { name: 'nothing paid → unpaid', total: 35000, net: 0, expected: 'unpaid' },
    { name: 'part paid → partially-paid', total: 35000, net: 20000, expected: 'partially-paid' },
    { name: 'exactly paid → paid', total: 35000, net: 35000, expected: 'paid' },
    { name: 'overpaid clamps → paid', total: 35000, net: 40000, expected: 'paid' },
    { name: 'over-reversed (negative net) → unpaid', total: 35000, net: -1000, expected: 'unpaid' },
    { name: 'fully reversed back to 0 → unpaid', total: 35000, net: 0, expected: 'unpaid' },
    { name: 'zero-total invoice, nothing paid → unpaid', total: 0, net: 0, expected: 'unpaid' },
  ];

  it.each(cases)('$name', ({ total, net, expected }) => {
    expect(paymentStatusOf(total, net)).toBe(expected);
  });
});

describe('derivePaymentStatus', () => {
  it('is unpaid with no payments', () => {
    expect(derivePaymentStatus(35000, [])).toBe('unpaid');
  });

  it('is partially-paid when payments cover part of the total', () => {
    expect(derivePaymentStatus(35000, [makePayment('payment', 20000)])).toBe('partially-paid');
  });

  it('is paid when payments meet the total', () => {
    const payments = [makePayment('payment', 20000), makePayment('payment', 15000)];
    expect(derivePaymentStatus(35000, payments)).toBe('paid');
  });

  it('clamps overpayment to paid', () => {
    expect(derivePaymentStatus(35000, [makePayment('payment', 50000)])).toBe('paid');
  });

  it('drops back from paid to partially-paid after a reversal', () => {
    const paid = [makePayment('payment', 20000), makePayment('payment', 15000)];
    expect(derivePaymentStatus(35000, paid)).toBe('paid');
    const reversed = [...paid, makePayment('reversal', 15000)];
    expect(derivePaymentStatus(35000, reversed)).toBe('partially-paid');
  });

  it('drops back to unpaid when every payment is reversed', () => {
    const payments = [
      makePayment('payment', 35000),
      makePayment('reversal', 35000),
    ];
    expect(derivePaymentStatus(35000, payments)).toBe('unpaid');
  });
});
