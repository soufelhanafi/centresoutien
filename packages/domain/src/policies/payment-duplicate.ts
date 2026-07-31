import type { Payment } from '../entities/payment';

/** The identifying trio of a probable double-entry: same invoice, amount, and day. */
export type DoubleEntryCandidate = Pick<Payment, 'invoiceId' | 'amountMad' | 'paidOn'>;

/**
 * Detect probable double-entry payments (SOU-93): the only "conflict" an append-only
 * ledger can produce is the *same* payment keyed in twice — once per laptop — before a
 * sync. Two rows match when they share `invoiceId`, `amountMad`, and `paidOn` (the same
 * money, on the same invoice, on the same day). This is a **flag, not an auto-merge**:
 * the admin decides in the duplicates tab whether to void one (a reversal), because a
 * center legitimately can take two identical cash payments in one day.
 *
 * Pure and portable. Only real `payment` rows are compared — a `reversal` is not a
 * double-entry — and the candidate itself (matched by `id`) and tombstones are
 * excluded. The conflict-popup UI that consumes this lives in SOU-91, not here.
 *
 * @returns the existing payments that look like duplicates of `candidate`, `[]` if none.
 */
export function detectProbableDoubleEntry(
  candidate: DoubleEntryCandidate & { id?: Payment['id'] },
  existing: readonly Payment[],
): readonly Payment[] {
  return existing.filter(
    (payment) =>
      payment.kind === 'payment' &&
      payment.deletedAt === null &&
      payment.id !== candidate.id &&
      payment.invoiceId === candidate.invoiceId &&
      payment.amountMad === candidate.amountMad &&
      payment.paidOn === candidate.paidOn,
  );
}

/** The identifying key of a duplicate reversal: it voids the same original payment. */
export type ReversalCandidate = Pick<Payment, 'reversesPaymentId'> & { id?: Payment['id'] };

/**
 * Detect duplicate reversals (SOU-93): the append-only twin of
 * {@link detectProbableDoubleEntry}. `VoidPayment`'s already-reversed guard only sees one
 * device's ledger, so two laptops voiding the *same* payment while offline each append a
 * distinct reversal. They union at sync, the net is subtracted twice, and the derived
 * status silently over-reverses to `unpaid` — the error hides itself instead of surfacing.
 *
 * Two reversals match when they share a non-null `reversesPaymentId` (they void the same
 * original). Like its sibling this is a **flag, not an auto-merge** — the duplicates tab
 * (SOU-91) lets the admin keep one and discard the other. Pure and portable; the candidate
 * itself (matched by `id`) is excluded. A `null` `reversesPaymentId` (a plain payment) can
 * never match — only reversals carry a target.
 *
 * @returns the existing reversals that void the same payment as `candidate`, `[]` if none.
 */
export function detectDuplicateReversals(
  candidate: ReversalCandidate,
  existing: readonly Payment[],
): readonly Payment[] {
  if (candidate.reversesPaymentId === null) return [];
  return existing.filter(
    (payment) =>
      payment.kind === 'reversal' &&
      payment.deletedAt === null &&
      payment.id !== candidate.id &&
      payment.reversesPaymentId !== null &&
      payment.reversesPaymentId === candidate.reversesPaymentId,
  );
}
