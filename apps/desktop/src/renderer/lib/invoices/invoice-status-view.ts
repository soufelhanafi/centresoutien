import type { InvoiceStatusTone } from '@centresoutien/ui';
import type { InvoiceListItemView } from './invoice-view';

/**
 * Collapses the lifecycle + derived payment dimensions into the single tone
 * `StatusBadge` renders. `cancelled` is the one lifecycle state that outranks
 * paid-ness. `draft` does NOT: there is no `invoice.issue` channel wired on this
 * branch (SOU-69's own scope), so every invoice SOU-68's monthly job produces
 * stays `draft` forever — masking payment status behind "Brouillon" would make
 * the payment-tracking feature (list filter, payment panel, "mark paid") this
 * ticket exists to ship permanently unreachable. `RecordPayment` (domain) has
 * no status guard either, so a draft invoice can be paid exactly like an issued
 * one; the badge must reflect that.
 */
export function invoiceStatusTone(
  invoice: Pick<InvoiceListItemView, 'status' | 'paymentStatus'>,
): InvoiceStatusTone {
  if (invoice.status === 'cancelled') return 'cancelled';
  return invoice.paymentStatus;
}

export function invoiceStatusLabelKey(tone: InvoiceStatusTone): string {
  return `invoices.status.${tone}`;
}
