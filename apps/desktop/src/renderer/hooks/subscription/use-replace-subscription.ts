import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubscriptionInput } from '../../lib/subscriptions/subscription-view';
import { subscriptionsGateway } from '../../lib/subscriptions/subscriptions-gateway';
import { subscriptionKeys } from './keys';

type ReplaceSubscriptionInput = SubscriptionInput & { activeSubscriptionId: string };

/** Atomically closes a live subscription and creates its replacement (SOU-141). */
export function useReplaceSubscription(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activeSubscriptionId, ...input }: ReplaceSubscriptionInput) =>
      subscriptionsGateway.replace(input, activeSubscriptionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.list(studentId) }),
  });
}
