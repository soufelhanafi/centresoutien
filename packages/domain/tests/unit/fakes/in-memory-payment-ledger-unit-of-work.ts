import type {
  PaymentLedgerUnitOfWork,
  PaymentLedgerCommit,
  PaymentLedgerCommitResult,
} from '../../../src/ports/payment-ledger-unit-of-work';
import { netPaidMad } from '../../../src/policies/payment-status';
import type { InMemoryPaymentRepository } from './in-memory-payment-repository';

/**
 * In-memory {@link PaymentLedgerUnitOfWork} for unit tests. Mirrors the SQLite
 * adapter's one-transaction guarantee: it re-reads the invoice's net, re-validates the
 * caller's invariant, and appends — as ONE synchronous critical section, so two
 * commits raced through `Promise.all` serialize exactly as the DB transaction would
 * (the read never yields before the matching append). The double-reversal guard mirrors
 * the partial-unique index: a second reversal of the same payment throws the caller's
 * `onDuplicateReversal` error.
 *
 * The true atomicity guarantee is the real SQLite transaction — an integration test
 * pins that. This fake asserts the invariant against the same seam at the domain level.
 */
export class InMemoryPaymentLedgerUnitOfWork implements PaymentLedgerUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case calls it exactly once. */
  commits = 0;

  constructor(private readonly payments: InMemoryPaymentRepository) {}

  async commit(commit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult> {
    this.commits += 1;
    const { candidate } = commit;

    const ledger = this.payments
      .all()
      .filter((row) => row.deletedAt === null && row.invoiceId === candidate.invoiceId);
    const netBefore = netPaidMad(ledger);
    commit.revalidate(netBefore);

    if (candidate.kind === 'reversal' && commit.onDuplicateReversal) {
      const alreadyReversed = ledger.some(
        (row) => row.kind === 'reversal' && row.reversesPaymentId === candidate.reversesPaymentId,
      );
      if (alreadyReversed) throw commit.onDuplicateReversal();
    }

    await this.payments.append(candidate);
    const delta = candidate.kind === 'reversal' ? -candidate.amountMad : candidate.amountMad;
    return { netPaidMad: netBefore + delta };
  }
}
