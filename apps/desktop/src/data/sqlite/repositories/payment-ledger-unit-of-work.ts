import type { Database as DB } from 'better-sqlite3';
import type {
  PaymentLedgerUnitOfWork,
  PaymentLedgerCommit,
  PaymentLedgerCommitResult,
} from '@centresoutien/domain';
import { paymentToParams, APPEND_PAYMENT_SQL, SUM_FOR_INVOICE_SQL } from './payment-sql';

/**
 * SQLite adapter for {@link PaymentLedgerUnitOfWork} (SOU-233 / audit CS-AUD-002). It
 * closes the check-then-insert race by running the domain's guard and the append inside
 * a SINGLE `db.transaction`: the net paid is re-read, `commit.revalidate` re-validates
 * the invariant against that in-transaction net (a throw rolls the whole transaction
 * back — nothing is written), then the row is appended. Because better-sqlite3
 * transactions are synchronous and serialize on the single connection, no concurrent
 * commit can slip between the read and the insert.
 *
 * The append may trip the partial-unique index `ux_payments_reversal_once` (0042) — a
 * second reversal of the same payment landed first. SQLite raises
 * `SQLITE_CONSTRAINT_UNIQUE`; the adapter translates only that specific violation into
 * the caller's `commit.onDuplicateReversal()` domain error, never inventing which error
 * it means. A re-appended primary key raises `SQLITE_CONSTRAINT_PRIMARYKEY` (a distinct
 * code) and propagates unchanged. All business decisions stay in the injected
 * predicates; this adapter only orchestrates the transaction and maps the one
 * constraint. Mirrors {@link SqlitePaymentRepository}, which owns the same SQL.
 */
export class SqlitePaymentLedgerUnitOfWork implements PaymentLedgerUnitOfWork {
  private readonly sumStatement;
  private readonly appendStatement;

  constructor(private readonly db: DB) {
    this.sumStatement = db.prepare(SUM_FOR_INVOICE_SQL);
    this.appendStatement = db.prepare(APPEND_PAYMENT_SQL);
  }

  async commit(commit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult> {
    const { candidate } = commit;
    const delta = candidate.kind === 'reversal' ? -candidate.amountMad : candidate.amountMad;

    const runInTransaction = this.db.transaction((): PaymentLedgerCommitResult => {
      const netBefore = (this.sumStatement.get(candidate.invoiceId) as { net: number }).net;
      commit.revalidate(netBefore);
      this.appendStatement.run(paymentToParams(candidate));
      return { netPaidMad: netBefore + delta };
    });

    try {
      return runInTransaction();
    } catch (error) {
      if (isDuplicateReversalViolation(error) && commit.onDuplicateReversal) {
        throw commit.onDuplicateReversal();
      }
      throw error;
    }
  }
}

/**
 * True only for the partial-unique reversal-once index. better-sqlite3's `SqliteError`
 * carries a string `code`; a UNIQUE violation is the sole unique constraint on
 * `payments` (the id is a PRIMARY KEY, which raises the distinct
 * `SQLITE_CONSTRAINT_PRIMARYKEY`), so the code alone is a reliable discriminator. Read
 * structurally rather than via `instanceof` — the runtime class lives in
 * `better-sqlite3-multiple-ciphers`, not the `better-sqlite3` types package.
 */
function isDuplicateReversalViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
