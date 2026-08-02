import type { InvoiceStatusTone } from '@centresoutien/ui';
import type { InvoiceListItemView } from './invoice-view';

/**
 * Collapses the lifecycle + derived payment dimensions into the single tone
 * `StatusBadge` renders: `draft` and `cancelled` are lifecycle states that
 * outrank paid-ness; an `issued` invoice shows its payment status instead.
 */
export function invoiceStatusTone(
  invoice: Pick<InvoiceListItemView, 'status' | 'paymentStatus'>,
): InvoiceStatusTone {
  if (invoice.status === 'draft') return 'draft';
  if (invoice.status === 'cancelled') return 'cancelled';
  return invoice.paymentStatus;
}

export function invoiceStatusLabelKey(tone: InvoiceStatusTone): string {
  return `invoices.status.${tone}`;
}
