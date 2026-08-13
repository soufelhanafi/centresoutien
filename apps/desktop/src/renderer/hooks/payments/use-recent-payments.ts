import { useQuery } from '@tanstack/react-query';
import { paymentsGateway } from '../../lib/payments/payments-gateway';
import type { RecentPaymentsQuery } from '../../lib/payments/recent-payment-view';
import { paymentKeys } from './keys';

/** Cash-desk reads stay fresh for this long, so re-entering the feed tab reuses the
 *  cache instead of refetching on every switch. Recording/voiding a payment
 *  invalidates the key explicitly, so this never hides a just-made change. */
const RECENT_PAYMENTS_STALE_MS = 30_000;

/**
 * Loads the center's cross-invoice recent payments (SOU-198), optionally bounded
 * to a `paidOn` day window + row cap. Data access goes through the
 * {@link paymentsGateway} seam, not `window.api` directly, so the adapter is
 * swappable in a single place.
 */
export function useRecentPayments(query: RecentPaymentsQuery) {
  return useQuery({
    queryKey: paymentKeys.recent(query),
    queryFn: () => paymentsGateway.listRecent(query),
    refetchOnWindowFocus: false,
    staleTime: RECENT_PAYMENTS_STALE_MS,
  });
}
