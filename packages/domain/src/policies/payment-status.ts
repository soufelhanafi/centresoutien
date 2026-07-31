import type { Payment } from '../entities/payment';

/**
 * The **derived** payment status of an invoice (SOU-93). This is the payment dimension
 * SOU-67 deliberately deferred: the invoice header stores only its lifecycle
 * (`draft / issued / cancelled`), never a paid-ness scalar. Paid-ness is always a pure
 * function of the append-only {@link Payment} ledger, so it can never drift from the
 * money and is not an editable field that could clash at sync.
 */
export const PAYMENT_STATUSES = ['unpaid', 'partially-paid', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Net amount paid on an invoice, in integer MAD centimes: `Σ payments − Σ reversals`.
 * Reversals subtract because a void is a `reversal` entry, never a deleted row. Can go
 * to 0 (fully reversed) but the derivation clamps a negative net (over-reversal) to
 * `unpaid`. Pure and portable — the reader adapter computes the same sum in SQL.
 */
export function netPaidMad(payments: readonly Payment[]): number {
  return payments.reduce(
    (sum, payment) => sum + (payment.kind === 'reversal' ? -payment.amountMad : payment.amountMad),
    0,
  );
}

/**
 * Derive the payment status from an invoice total and the net already paid, both in
 * centimes. The numeric core of {@link derivePaymentStatus}, split out so a use case
 * that already knows the running net (e.g. right after appending a payment) does not
 * re-list the ledger.
 *
 * - `net <= 0` → `unpaid` (nothing paid, or fully/over-reversed).
 * - `net >= total` → `paid` (overpayment clamps to paid; it is never `partially-paid`).
 * - otherwise → `partially-paid`.
 *
 * A zero-total invoice (every line fully discounted) with no payments is `unpaid`;
 * `unpaid` here means "no money is owed *and* none was taken", which is the safe,
 * non-misleading reading for a 0 MAD invoice.
 */
export function paymentStatusOf(invoiceTotalMad: number, netPaidCentimes: number): PaymentStatus {
  if (netPaidCentimes <= 0) return 'unpaid';
  if (netPaidCentimes >= invoiceTotalMad) return 'paid';
  return 'partially-paid';
}

/**
 * Derive the payment status of an invoice from its total (centimes) and its full
 * {@link Payment} ledger. Overpayment and reversal both fall out for free:
 * overpayment clamps to `paid`; a reversal lowers the net and can move `paid` back to
 * `partially-paid` or `unpaid`.
 */
export function derivePaymentStatus(
  invoiceTotalMad: number,
  payments: readonly Payment[],
): PaymentStatus {
  return paymentStatusOf(invoiceTotalMad, netPaidMad(payments));
}
