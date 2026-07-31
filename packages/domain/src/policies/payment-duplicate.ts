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
