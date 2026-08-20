import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubscriptionInput } from '../../lib/subscriptions/subscription-view';
import { subscriptionsGateway } from '../../lib/subscriptions/subscriptions-gateway';
import { dashboardKeys } from '../dashboard/keys';
import { invoiceKeys } from '../invoice/keys';
import { subscriptionKeys } from './keys';

/**
 * Subscribes a student to a Formula. Invalidates that student's subscription
 * list, plus the invoice and dashboard "Argent" caches (SOU-289): creation may
 * have generated or topped up the start month's draft invoice, so the invoice
 * list, the student detail's invoices, and the billed figures must refetch.
 */
export function useCreateSubscription(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionInput) => subscriptionsGateway.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.list(studentId) });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.basic });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.advanced });
    },
  });
}
