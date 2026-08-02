import { useQuery } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** Loads a single invoice by id, for the detail screen. Returns `null` when not found. */
export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => invoicesGateway.get(id),
    refetchOnWindowFocus: false,
  });
}
