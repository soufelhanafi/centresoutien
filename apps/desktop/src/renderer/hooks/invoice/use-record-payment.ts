import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway, type RecordPaymentInput } from '../../lib/invoices/invoices-gateway';
import { dashboardKeys } from '../dashboard/keys';
import { dayCloseKeys } from '../day-close/keys';
import { paymentKeys } from '../payments/keys';
import { payrollKeys } from '../payroll/keys';
import { invoiceKeys } from './keys';

/**
 * Records a payment against an invoice ("mark paid"). Invalidates the invoice
 * list + this detail, the cross-invoice cash-desk feed (SOU-198) so today's
 * takings and the recent-payments list refresh on the `/payments` page, and the
 * dashboard "Argent" summaries (SOU-226) — those read their own `dashboardKeys`,
 * which neither the invoice nor the payment key prefixes cover, so recording a
 * payment left the billed/collected/unpaid figures stale until a manual reload.
 * The day-close report (SOU-300) is mounted on the same `/payments` page under its
 * own `dayCloseKeys`, so it is invalidated too — otherwise its totals/encaissements
 * stay stale right after a payment is recorded.
 *
 * Invalidation runs `onSettled`, not just on success, mirroring the sibling
 * `useReversePayment`: a rejection can still mean the ledger already moved on
 * another device (the SOU-233 concurrency guard lost the race), so the local
 * invoice/payment/dashboard views are stale and must refetch either way. The
 * write-back of the returned invoice detail only applies on success, where the
 * fresh invoice actually exists.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => invoicesGateway.recordPayment(input),
    onSettled: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: dayCloseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
      queryClient.invalidateQueries({ queryKey: payrollKeys.projectionAll });
      if (invoice) {
        queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
      }
    },
  });
}
