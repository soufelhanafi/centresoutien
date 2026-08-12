import type { Payment } from '../entities/payment';

/**
 * The candidate ledger row plus the domain invariant that must still hold when it is
 * appended. `RecordPayment` / `VoidPayment` build this, then hand it to
 * {@link PaymentLedgerUnitOfWork.commit} — they never `append` a payment directly, so
 * the check and the write are one indivisible unit (SOU-233 / audit CS-AUD-002).
 *
 * The business arithmetic and the error *decisions* stay in the domain: the adapter
 * only re-reads the authoritative net paid inside the transaction and calls
 * `revalidate` / `onDuplicateReversal`, which throw the right domain error. The adapter
 * invents no rule of its own.
 */
export type PaymentLedgerCommit = {
  /** The `payment` or `reversal` row to append if the invariant still holds. */
  readonly candidate: Payment;
  /**
   * Re-check the invariant against `netPaidMad` — the invoice's net paid
   * (`Σ payments − Σ reversals`, centimes) read fresh **inside** the transaction, an
   * instant before the append. Throw a `DomainError` to abort and roll the whole unit
   * back; return normally to let the append proceed. For a payment this re-runs the
   * balance/overpayment check against concurrent state (the check-then-insert race the
   * audit flagged); for a reversal it is typically a no-op, since the double-entry guard
   * is the DB partial-unique index surfaced through `onDuplicateReversal`.
   */
  readonly revalidate: (netPaidMad: number) => void;
  /**
   * Maps a duplicate-reversal unique-constraint violation (a concurrent reversal of the
   * same payment already landed in this database) to the domain error the caller wants
   * surfaced — `PaymentAlreadyReversedError`. Only a `reversal` candidate can trip it;
   * omit for a `payment`. The adapter translates the raw SQLite unique violation, never
   * inventing which domain error it means.
   */
  readonly onDuplicateReversal?: () => Error;
};

/** The outcome of a committed append, read authoritatively inside the transaction. */
export type PaymentLedgerCommitResult = {
  /** Net paid on the invoice **after** the candidate was appended (`Σ payments − Σ reversals`). */
  readonly netPaidMad: number;
};

/**
 * The atomic commit seam for the append-only payment ledger (SOU-233 / audit
 * CS-AUD-002). Unlike the merge unit-of-work, which only writes precomputed rows, the
 * payment race requires the **guard to run inside the transaction**: two devices (or two
 * fast clicks) can each pass a check-then-insert flow and both append, pushing the net
 * past the invoice balance or double-reversing a payment.
 *
 * `commit` therefore performs, atomically inside **one** SQLite transaction:
 *   1. re-read the invoice's current net paid,
 *   2. re-validate the balance / reversal invariant via `commit.revalidate` (a throw
 *      aborts and rolls the whole unit back — nothing is written),
 *   3. append the candidate row.
 *
 * If step 3 trips the partial-unique reversal index, the whole transaction rolls back
 * and `commit.onDuplicateReversal()` decides the domain error to raise. The steps are
 * indivisible: no observer ever sees the read without the matching write, so a
 * concurrent commit cannot slip between the check and the insert. Business decisions
 * stay in the injected predicates; the adapter only orchestrates the transaction.
 */
export interface PaymentLedgerUnitOfWork {
  /** Re-validate against fresh in-transaction state, then append — all or nothing. */
  commit(commit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult>;
}
