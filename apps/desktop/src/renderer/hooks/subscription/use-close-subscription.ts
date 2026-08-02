import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionsGateway } from '../../lib/subscriptions/subscriptions-gateway';
import { subscriptionKeys } from './keys';

type CloseSubscriptionInput = { subscriptionId: string; endMonth: string };

/** Closes a student's live subscription — the first half of close-and-reopen. */
export function useCloseSubscription(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, endMonth }: CloseSubscriptionInput) =>
      subscriptionsGateway.close(subscriptionId, endMonth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.list(studentId) }),
  });
}
