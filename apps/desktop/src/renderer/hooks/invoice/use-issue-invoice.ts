import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { payrollKeys } from '../payroll/keys';
import { invoiceKeys } from './keys';

// Issues a draft invoice (draft -> issued). Invalidates the list and this detail,
// and the current-month payroll projection (an issued invoice enters the collected ledger).
export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => invoicesGateway.issue(invoiceId),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: payrollKeys.projectionAll });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
