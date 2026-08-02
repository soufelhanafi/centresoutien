import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubscriptionInput } from '../../lib/subscriptions/subscription-view';
import { subscriptionsGateway } from '../../lib/subscriptions/subscriptions-gateway';
import { subscriptionKeys } from './keys';

/** Subscribes a student to a Formula. Invalidates that student's subscription list. */
export function useCreateSubscription(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionInput) => subscriptionsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.list(studentId) }),
  });
}
