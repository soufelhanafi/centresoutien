import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoicesGateway } from '../../lib/invoices/invoices-gateway';
import { arrearsKeys } from '../arrears/keys';
import { dashboardKeys } from '../dashboard/keys';
import { paymentKeys } from '../payments/keys';
import { invoiceKeys } from './keys';

/**
 * Reverses a recorded payment via an append-only counter-entry (SOU-237). A
 * reversal changes the invoice's net paid / outstanding / derived status, the
 * cross-invoice cash-desk feed, the arrears list, and dashboard money KPIs — so
 * it invalidates all four families. Invalidating `invoiceKeys.all` (`['invoices']`)
 * prefix-covers the list, detail, open, and this invoice's payment-summary query.
 */
export function useReversePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => invoicesGateway.reversePayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: arrearsKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
    },
  });
}
