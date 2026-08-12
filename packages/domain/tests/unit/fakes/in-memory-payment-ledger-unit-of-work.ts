import type {
  PaymentLedgerUnitOfWork,
  PaymentLedgerCommit,
  PaymentLedgerCommitResult,
} from '../../../src/ports/payment-ledger-unit-of-work';
import type { InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import { netPaidMad } from '../../../src/policies/payment-status';
import type { InMemoryPaymentRepository } from './in-memory-payment-repository';

/** The minimal live-status lookup the payability guard needs — satisfied by
 *  {@link InMemoryInvoiceRepository} and by test doubles that simulate a cancel race. */
export type InvoiceStatusSource = {
  findById(id: InvoiceId): Promise<{ status: InvoiceStatus } | null>;
};

/**
 * In-memory {@link PaymentLedgerUnitOfWork} for unit tests. Mirrors the SQLite
 * adapter's one-transaction guarantee: it re-reads the invoice's live status and net,
 * re-validates the caller's invariants, and appends — as ONE synchronous critical
 * section, so two commits raced through `Promise.all` serialize exactly as the DB
 * transaction would (the read never yields before the matching append). The payability
 * guard reads the live invoice status from the injected source, and the double-reversal
 * guard mirrors the adapter's in-transaction check — when a live reversal of the same
 * payment already exists, it throws the caller's `reversalOf.onAlreadyReversed()` error.
 *
 * The true atomicity guarantee is the real SQLite transaction — an integration test
 * pins that. This fake asserts the invariants against the same seam at the domain level.
 */
export class InMemoryPaymentLedgerUnitOfWork implements PaymentLedgerUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case calls it exactly once. */
  commits = 0;

  constructor(
    private readonly payments: InMemoryPaymentRepository,
    private readonly invoices?: InvoiceStatusSource,
  ) {}

  async commit(unit: PaymentLedgerCommit): Promise<PaymentLedgerCommitResult> {
    this.commits += 1;
    const { candidate } = unit;

    // In-transaction payability guard — reads the invoice's LIVE status, so a cancel that
    // landed since the caller's pre-check is caught here (audit #8).
    if (unit.payableInvoice) {
      const invoice = this.invoices ? await this.invoices.findById(unit.payableInvoice.invoiceId) : null;
      unit.payableInvoice.revalidate(invoice?.status ?? null);
    }

    // In-transaction "reversed at most once" guard — the authoritative check, mirroring
    // the SQLite adapter's in-tx SELECT (not a reliance on the unique index).
    if (unit.reversalOf) {
      const alreadyReversed = this.payments
        .all()
        .some(
          (row) =>
            row.deletedAt === null &&
            row.kind === 'reversal' &&
            row.reversesPaymentId === unit.reversalOf!.paymentId,
        );
      if (alreadyReversed) throw unit.reversalOf.onAlreadyReversed();
    }

    const ledger = this.payments
      .all()
      .filter((row) => row.deletedAt === null && row.invoiceId === candidate.invoiceId);
    const netBefore = netPaidMad(ledger);
    unit.revalidate(netBefore);

    await this.payments.append(candidate);
    const delta = candidate.kind === 'reversal' ? -candidate.amountMad : candidate.amountMad;
    return { netPaidMad: netBefore + delta };
  }
}
