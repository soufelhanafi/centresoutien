import type { Payment, PaymentId } from '../entities/payment';
import type { InvoiceId, InvoiceStatus } from '../entities/invoice';

/**
 * The payability half of a {@link PaymentLedgerCommit}. The invoice's lifecycle status
 * lives on a DIFFERENT row from the ledger, so a concurrent `CancelInvoice` can persist
 * `cancelled` between `RecordPayment`'s fast pre-check and the append. The adapter
 * therefore re-reads the invoice's live `status` INSIDE the payment transaction and hands
 * it to `revalidate`, symmetric with `revalidate(netPaidMad)` for the balance — a throw
 * rolls the whole commit back so no payment lands on a cancelled invoice. `status` is
 * `null` when the invoice row is gone/tombstoned mid-transaction. The domain decides the
 * error (`InvoiceNotPayableError` / `InvoiceNotFoundError`); the adapter only reads.
 */
export type PayableInvoiceGuard = {
  /** The invoice the payment targets. */
  readonly invoiceId: InvoiceId;
  /** Re-check the live status read in-transaction; throw a domain error to abort. */
  readonly revalidate: (status: InvoiceStatus | null) => void;
};

/**
 * The reversal-specific half of a {@link PaymentLedgerCommit}. When the candidate is a
 * `reversal`, the unit-of-work must guarantee a payment is voided **at most once**. The
 * adapter enforces this INSIDE the transaction — it queries whether a live reversal for
 * `paymentId` already exists and, if so, raises `onAlreadyReversed()` before appending —
 * so integrity no longer depends on the DB index (the partial-unique index is kept as a
 * defense-in-depth backstop for any writer that bypasses this seam, and its violation is
 * mapped to the same `onAlreadyReversed()` error). The domain decides the error
 * (`PaymentAlreadyReversedError`); the adapter only runs the query and calls the predicate.
 */
export type PaymentReversalGuard = {
  /** The payment this reversal voids. */
  readonly paymentId: PaymentId;
  /** The error to raise when a live reversal already exists for `paymentId`. */
  readonly onAlreadyReversed: () => Error;
};

/**
 * The candidate ledger row plus the domain invariants that must still hold when it is
 * appended. `RecordPayment` / `VoidPayment` build this, then hand it to
 * {@link PaymentLedgerUnitOfWork.commit} — they never `append` a payment directly, so
 * the checks and the write are one indivisible unit (SOU-233 / audit CS-AUD-002).
 *
 * The business arithmetic and the error *decisions* stay in the domain: the adapter only
 * re-reads authoritative state inside the transaction and calls `revalidate` /
 * `reversalOf.onAlreadyReversed`, which throw the right domain error. The adapter invents
 * no rule of its own.
 */
export type PaymentLedgerCommit = {
  /** The `payment` or `reversal` row to append if the invariants still hold. */
  readonly candidate: Payment;
  /**
   * Re-check the balance invariant against `netPaidMad` — the invoice's net paid
   * (`Σ payments − one reversal per reversed payment`, centimes) read fresh **inside**
   * the transaction, an instant before the append. Throw a `DomainError` to abort and
   * roll the whole unit back; return normally to let the append proceed. For a payment
   * this re-runs the balance/overpayment check against concurrent state (the
   * check-then-insert race the audit flagged); for a reversal it is typically a no-op,
   * because the double-void guard is `reversalOf`.
   */
  readonly revalidate: (netPaidMad: number) => void;
  /**
   * Present for a `payment` against an invoice. Makes the transaction the authoritative
   * payability guard: the adapter re-reads the invoice's live `status` in-transaction and
   * calls `revalidate`, so a `CancelInvoice` racing between the pre-check and the append
   * cannot let money land on a cancelled invoice (audit CS-AUD-001 #8).
   */
  readonly payableInvoice?: PayableInvoiceGuard;
  /**
   * Present iff the candidate is a `reversal`. Makes the transaction the authoritative
   * "reversed at most once" guard (symmetric with `revalidate` for payments): the
   * adapter checks in-transaction whether a live reversal for `reversalOf.paymentId`
   * already exists and raises `onAlreadyReversed()` if so — before appending — never
   * relying on the index alone.
   */
  readonly reversalOf?: PaymentReversalGuard;
};

/** The outcome of a committed append, read authoritatively inside the transaction. */
export type PaymentLedgerCommitResult = {
  /** Net paid on the invoice **after** the candidate was appended (each payment reversed once). */
  readonly netPaidMad: number;
};

/**
 * The atomic commit seam for the append-only payment ledger (SOU-233 / audit
 * CS-AUD-002). Unlike the merge unit-of-work, which only writes precomputed rows, the
 * payment races require the **guards to run inside the transaction**: two devices (or two
 * fast clicks) can each pass a check-then-insert flow and both append, pushing the net
 * past the invoice balance or double-reversing a payment.
 *
 * `commit` therefore performs, atomically inside **one** SQLite transaction:
 *   1. for a payment, re-read the invoice's live `status` and re-check payability via
 *      `payableInvoice.revalidate` (closes the cancel race, audit #8),
 *   2. for a reversal, re-check that no live reversal of `reversalOf.paymentId` exists
 *      (raise `onAlreadyReversed()` if one does),
 *   3. re-read the invoice's current net paid,
 *   4. re-validate the balance invariant via `revalidate` (a throw aborts and rolls the
 *      whole unit back — nothing is written),
 *   5. append the candidate row.
 *
 * A throw at any step rolls the whole transaction back. The steps are indivisible: no
 * observer ever sees a read without the matching write, so a concurrent commit cannot
 * slip between a check and the insert. Business decisions stay in the injected
 * predicates; the adapter only orchestrates the transaction.
 */
export interface PaymentLedgerUnitOfWork {
  /** Re-validate against fresh in-transaction state, then append — all or nothing. */
  commit(unit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult>;
}
