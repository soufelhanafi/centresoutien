import { useQuery } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** Loads an invoice's total/net/outstanding + its full payment ledger, for the
 *  per-invoice payment history list (SOU-101). */
export function usePaymentSummary(invoiceId: string) {
  return useQuery({
    queryKey: invoiceKeys.paymentSummary(invoiceId),
    queryFn: () => invoicesGateway.paymentSummary(invoiceId),
    refetchOnWindowFocus: false,
  });
}
