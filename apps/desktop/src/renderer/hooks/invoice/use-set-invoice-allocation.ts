import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import type { InvoiceSubjectAllocation } from '../../lib/invoices/invoice-view';
import { invoiceKeys } from './keys';

type SetInvoiceAllocationInput = {
  readonly invoiceId: string;
  readonly allocations: readonly InvoiceSubjectAllocation[] | null;
};

/**
 * Sets or clears an invoice's manual per-subject attribution override (SOU-298).
 * Invalidates the invoice list + this detail, then writes the read-back invoice
 * into the detail cache so the control reflects the new state immediately. Data
 * access goes through the {@link invoicesGateway} seam, never `window.api`.
 */
export function useSetInvoiceAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, allocations }: SetInvoiceAllocationInput) =>
      invoicesGateway.setAllocation(invoiceId, allocations),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
