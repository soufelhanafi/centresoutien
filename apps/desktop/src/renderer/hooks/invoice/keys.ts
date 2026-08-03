import type { InvoiceListFilters } from '../../lib/invoices/invoice-view';

/** Query keys for the invoices module. Mutations invalidate `invoiceKeys.all`. */
export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceListFilters) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
  paymentSummary: (invoiceId: string) => ['invoices', 'payment-summary', invoiceId] as const,
};
