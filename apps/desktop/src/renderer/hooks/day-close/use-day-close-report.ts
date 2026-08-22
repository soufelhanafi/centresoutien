import { useQuery } from '@tanstack/react-query';
import { dayCloseGateway } from '../../lib/day-close/day-close-gateway';
import { dayCloseKeys } from './keys';

/**
 * The composed end-of-day "Clôture du jour" report for a given `'YYYY-MM-DD'` day
 * (SOU-300): new subscriptions, enrollments, invoices generated, cash collected
 * (split by method), and the day's encaissements. A pure read behind the
 * {@link dayCloseGateway} seam; the day is passed by the caller (the report screen
 * owns the date picker), not derived here.
 */
export function useDayCloseReport(day: string) {
  return useQuery({
    queryKey: dayCloseKeys.report(day),
    queryFn: () => dayCloseGateway.getReport(day),
    refetchOnWindowFocus: false,
  });
}
