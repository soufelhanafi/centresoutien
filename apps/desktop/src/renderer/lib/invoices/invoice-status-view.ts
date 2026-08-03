import type { InvoiceStatusTone } from '@centresoutien/ui';
import type { InvoiceListItemView } from './invoice-view';

/**
 * Collapses the lifecycle + derived payment dimensions into the single tone
 * `StatusBadge` renders. `cancelled` is the one lifecycle state that outranks
 * paid-ness. `draft` does NOT: `RecordPayment` (domain) has no lifecycle-status
 * guard, so a draft invoice can be paid exactly like an issued one — masking
 * payment status behind "Brouillon" would hide real payment state from the
 * director. Issuing (SOU-143) only moves the lifecycle dimension forward; it
 * doesn't change this.
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
