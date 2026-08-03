import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { invoiceKeys } from './keys';

/** Issues a draft invoice (draft -> issued). Invalidates the list and this detail. */
export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesGateway.issue(invoiceId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
