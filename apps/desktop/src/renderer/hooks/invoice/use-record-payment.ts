import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway, type RecordPaymentInput } from '../../lib/invoices/invoices-gateway';
import { dashboardKeys } from '../dashboard/keys';
import { paymentKeys } from '../payments/keys';
import { invoiceKeys } from './keys';

/**
 * Records a payment against an invoice ("mark paid"). Invalidates the invoice
 * list + this detail, the cross-invoice cash-desk feed (SOU-198) so today's
 * takings and the recent-payments list refresh on the `/payments` page, and the
 * dashboard "Argent" summaries (SOU-226) — those read their own `dashboardKeys`,
 * which neither the invoice nor the payment key prefixes cover, so recording a
 * payment left the billed/collected/unpaid figures stale until a manual reload.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => invoicesGateway.recordPayment(input),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
    },
  });
}
