import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway, type UpdateInvoiceLineAmountInput } from '../../lib/invoices/invoices-gateway';
import { dashboardKeys } from '../dashboard/keys';
import { payrollKeys } from '../payroll/keys';
import { invoiceKeys } from './keys';

/**
 * Overrides a draft invoice line's amount (SOU-289). Invalidates the invoice
 * list + this detail and the dashboard "Argent" summaries — the billed total
 * changed — then writes the read-back invoice into the detail cache so the
 * page's totals refresh immediately.
 */
export function useUpdateInvoiceLineAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInvoiceLineAmountInput) => invoicesGateway.updateLineAmount(input),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
      queryClient.invalidateQueries({ queryKey: payrollKeys.projectionAll });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
