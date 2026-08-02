import { useQuery } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import type { InvoiceListFilters } from '../../lib/invoices/invoice-view';
import { invoiceKeys } from './keys';

/**
 * Loads the invoice list, filtered by month / student / derived payment
 * status. Data access goes through the {@link invoicesGateway} seam, not
 * `window.api` directly, so the mock adapter swaps for the real IPC one in a
 * single place.
 */
export function useInvoices(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: invoiceKeys.list(filters),
    queryFn: () => invoicesGateway.list(filters),
    refetchOnWindowFocus: false,
  });
}
