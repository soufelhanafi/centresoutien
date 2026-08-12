import type { Database as DB } from 'better-sqlite3';
import type {
  PaymentLedgerUnitOfWork,
  PaymentLedgerCommit,
  PaymentLedgerCommitResult,
  InvoiceStatus,
} from '@centresoutien/domain';
import { paymentToParams, APPEND_PAYMENT_SQL, SUM_FOR_INVOICE_SQL } from './payment-sql';
import { REVERSAL_ONCE_INDEX } from '../repairs/payment-reversal-index';

// A live reversal already voiding a given payment. Backs the in-transaction
// "reversed at most once" guard (SOU-233 / audit CS-AUD-002) — the authoritative check,
// not a reliance on the partial-unique index.
const LIVE_REVERSAL_EXISTS_SQL = `
  SELECT 1 FROM payments
   WHERE reverses_payment_id = ? AND kind = 'reversal' AND deleted_at IS NULL
   LIMIT 1
`;

// The invoice's live lifecycle status, read in-transaction so a CancelInvoice racing the
// payment pre-check is visible before the append (audit CS-AUD-001 #8). NULL row → the
// invoice is gone/tombstoned; the domain guard decides what that means.
const INVOICE_STATUS_SQL = `
  SELECT status FROM invoices WHERE id = ? AND deleted_at IS NULL
`;

/**
 * SQLite adapter for {@link PaymentLedgerUnitOfWork} (SOU-233 / audit CS-AUD-002). It
 * closes the check-then-insert races by running the domain's guards and the append inside
 * a SINGLE `db.transaction`. For a reversal it first checks in-transaction that no live
 * reversal of the target payment already exists (raising the caller's error if one does),
 * making integrity independent of any index; then it re-reads the invoice's net paid,
 * re-validates the balance invariant via `unit.revalidate` (a throw rolls the whole
 * transaction back), and appends the row. Because better-sqlite3 transactions are
 * synchronous and serialize on the single connection, no concurrent commit can slip
 * between a check and the insert.
 *
 * The partial-unique index `ux_payments_reversal_once` (when present) is a defense-in-depth
 * backstop for any writer that bypasses this seam; the adapter translates only that
 * specific violation into the caller's `reversalOf.onAlreadyReversed()` domain error,
 * never inventing which error it means. A re-appended primary key raises
 * `SQLITE_CONSTRAINT_PRIMARYKEY` (a distinct code) and propagates unchanged. All business
 * decisions stay in the injected predicates; this adapter only orchestrates the
 * transaction and maps the one constraint. Mirrors {@link SqlitePaymentRepository}, which
 * owns the same SQL.
 */
export class SqlitePaymentLedgerUnitOfWork implements PaymentLedgerUnitOfWork {
  private readonly sumStatement;
  private readonly appendStatement;
  private readonly liveReversalStatement;
  private readonly invoiceStatusStatement;

  constructor(private readonly db: DB) {
    this.sumStatement = db.prepare(SUM_FOR_INVOICE_SQL);
    this.appendStatement = db.prepare(APPEND_PAYMENT_SQL);
    this.liveReversalStatement = db.prepare(LIVE_REVERSAL_EXISTS_SQL);
    this.invoiceStatusStatement = db.prepare(INVOICE_STATUS_SQL);
  }

  async commit(unit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult> {
    const { candidate } = unit;
    const delta = candidate.kind === 'reversal' ? -candidate.amountMad : candidate.amountMad;

    const runInTransaction = this.db.transaction((): PaymentLedgerCommitResult => {
      if (unit.payableInvoice) {
        const row = this.invoiceStatusStatement.get(unit.payableInvoice.invoiceId) as
          | { status: string }
          | undefined;
        unit.payableInvoice.revalidate((row?.status as InvoiceStatus | undefined) ?? null);
      }
      if (unit.reversalOf) {
        const existing = this.liveReversalStatement.get(unit.reversalOf.paymentId);
        if (existing !== undefined) throw unit.reversalOf.onAlreadyReversed();
      }
      const netBefore = (
        this.sumStatement.get({ invoice_id: candidate.invoiceId }) as { net: number }
      ).net;
      unit.revalidate(netBefore);
      this.appendStatement.run(paymentToParams(candidate));
      return { netPaidMad: netBefore + delta };
    });

    try {
      return runInTransaction();
    } catch (error) {
      if (isDuplicateReversalViolation(error) && unit.reversalOf) {
        throw unit.reversalOf.onAlreadyReversed();
      }
      throw error;
    }
  }
}

/**
 * True only for the partial-unique reversal-once index backstop. better-sqlite3's
 * `SqliteError` carries a string `code`; requiring BOTH the UNIQUE code AND the index
 * name in the message means a future, unrelated unique index on `payments` can never be
 * mis-mapped to a reversal error. Read structurally rather than via `instanceof` — the
 * runtime class lives in `better-sqlite3-multiple-ciphers`, not the `better-sqlite3`
 * types package.
 */
function isDuplicateReversalViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    error.message.includes(REVERSAL_ONCE_INDEX)
  );
}
