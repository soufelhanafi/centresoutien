import { useQuery } from '@tanstack/react-query';
import { paymentsGateway } from '../../lib/payments/payments-gateway';
import { todayIso } from '../../lib/payments/today';
import { paymentKeys } from './keys';

/**
 * Today's SQL-netted takings for the cash-desk header (SOU-198): the cap-free
 * `payment.takings` day aggregate, so a day with more than the feed's row cap
 * never under-reports. The key sits under the `['payments', …]` root, so
 * `useRecordPayment`'s `paymentKeys.all` invalidation still refreshes it.
 */
export function useTodayTakings() {
  const day = todayIso();
  return useQuery({
    queryKey: paymentKeys.takings(day),
    queryFn: () => paymentsGateway.getDayTakings(day),
    refetchOnWindowFocus: false,
  });
}
