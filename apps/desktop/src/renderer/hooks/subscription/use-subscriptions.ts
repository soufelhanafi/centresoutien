import { useQuery } from '@tanstack/react-query';
import { subscriptionsGateway } from '../../lib/subscriptions/subscriptions-gateway';
import { subscriptionKeys } from './keys';

/** Loads a student's live subscriptions (both tracks) — the Active/History tabs' source. */
export function useSubscriptions(studentId: string) {
  return useQuery({
    queryKey: subscriptionKeys.list(studentId),
    queryFn: () => subscriptionsGateway.list(studentId),
    refetchOnWindowFocus: false,
  });
}
