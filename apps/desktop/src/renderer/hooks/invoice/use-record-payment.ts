import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway, type RecordPaymentInput } from '../../lib/invoices/invoices-gateway';
import { paymentKeys } from '../payments/keys';
import { invoiceKeys } from './keys';

/**
 * Records a payment against an invoice ("mark paid"). Invalidates the invoice
 * list + this detail, and the cross-invoice cash-desk feed (SOU-198) so today's
 * takings and the recent-payments list refresh on the `/payments` page too.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => invoicesGateway.recordPayment(input),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
