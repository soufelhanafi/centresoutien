import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway, type RecordPaymentInput } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** Records a payment against an invoice ("mark paid"). Invalidates the list and this detail. */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => invoicesGateway.recordPayment(input),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
