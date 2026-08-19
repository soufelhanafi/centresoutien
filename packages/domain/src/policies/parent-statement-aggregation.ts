import type { InvoiceStatus } from '../entities/invoice';
import type { PaymentStatus } from './payment-status';

/** The per-child money a child contributes to its guardian's consolidated total. */
export type ParentStatementContribution = {
  readonly invoiceStatus: InvoiceStatus | null;
  readonly childTotalMad: number;
  readonly childNetPaidMad: number;
  readonly childOutstandingMad: number;
};

export type ParentStatementAggregate = {
  readonly grandTotalMad: number;
  readonly totalReceivedMad: number;
  readonly outstandingMad: number;
  readonly aggregateStatus: PaymentStatus;
};

/** A cancelled invoice is void (not owed) and a missing invoice bills nothing, so
 *  neither contributes to the consolidated total — only live, non-cancelled child
 *  invoices carry money onto the Facture groupée. */
function contributesMoney(invoiceStatus: InvoiceStatus | null): boolean {
  return invoiceStatus !== null && invoiceStatus !== 'cancelled';
}

/**
 * Fold each child's per-invoice money into the guardian's grand total (SOU-284).
 * Grand total / total received / outstanding are the sums across the money-bearing
 * children; a child with no invoice contributes `0` and never blocks a "paid".
 *
 * `aggregateStatus` keys off the **summed outstanding**, not `paymentStatusOf` over
 * (grand, received): if ANY child still owes, the statement is never "paid", even
 * when an overpayment on a sibling would otherwise push net past the grand total.
 * This is the one place that per-parent rule lives — the per-child status is still
 * derived by the shared `paymentStatusOf`.
 */
export function aggregateParentStatement(
  children: readonly ParentStatementContribution[],
): ParentStatementAggregate {
  let grandTotalMad = 0;
  let totalReceivedMad = 0;
  let outstandingMad = 0;
  for (const child of children) {
    if (!contributesMoney(child.invoiceStatus)) continue;
    grandTotalMad += child.childTotalMad;
    totalReceivedMad += child.childNetPaidMad;
    outstandingMad += child.childOutstandingMad;
  }
  return {
    grandTotalMad,
    totalReceivedMad,
    outstandingMad,
    aggregateStatus: aggregateStatusOf(grandTotalMad, totalReceivedMad, outstandingMad),
  };
}

function aggregateStatusOf(
  grandTotalMad: number,
  totalReceivedMad: number,
  outstandingMad: number,
): PaymentStatus {
  if (outstandingMad > 0) return totalReceivedMad > 0 ? 'partially-paid' : 'unpaid';
  return grandTotalMad > 0 ? 'paid' : 'unpaid';
}
