import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { payrollKeys } from '../payroll/keys';
import { invoiceKeys } from './keys';

// Cancels a draft or issued invoice (-> cancelled). Invalidates the list and this
// detail, and the current-month payroll projection (a cancelled invoice leaves both ledgers).
export function useCancelInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesGateway.cancel(invoiceId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: payrollKeys.projectionAll });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
