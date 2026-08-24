import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { todayIso } from '../../lib/payments/today';
import { arrearsKeys } from '../arrears/keys';
import { dashboardKeys } from '../dashboard/keys';
import { dayCloseKeys } from '../day-close/keys';
import { paymentKeys } from '../payments/keys';
import { payrollKeys } from '../payroll/keys';
import { invoiceKeys } from './keys';

/**
 * Reverses a recorded payment via an append-only counter-entry (SOU-237). A
 * reversal changes the invoice's net paid / outstanding / derived status, the
 * cross-invoice cash-desk feed, the arrears list, dashboard money KPIs, and the
 * day-close report (SOU-300) mounted on the same `/payments` page — so it invalidates
 * all of those families. Invalidating `invoiceKeys.all` (`['invoices']`)
 * prefix-covers the list, detail, open, and this invoice's payment-summary query.
 *
 * Invalidation runs `onSettled`, not just on success: a `payment-already-reversed`
 * rejection means the concurrency guard (SOU-233) lost the race because the ledger
 * already changed on another device — the local views are stale and must refetch
 * so the now-void reverse action disappears rather than repeatedly failing.
 *
 * The reversal's business date is the renderer's local `todayIso()` at click time
 * (SOU-244), so a void near local midnight nets against the same day the cash-desk
 * header shows — the domain Clock stays UTC and never infers this local day.
 */
export function useReversePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => invoicesGateway.reversePayment(paymentId, todayIso()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: arrearsKeys.all });
      queryClient.invalidateQueries({ queryKey: dayCloseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
      queryClient.invalidateQueries({ queryKey: payrollKeys.projectionAll });
    },
  });
}
