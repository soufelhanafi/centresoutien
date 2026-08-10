import { useMemo } from 'react';
import { summarizeTakings, type TakingsSummary } from '../../lib/payments/takings';
import { todayIso } from '../../lib/payments/today';
import { useRecentPayments } from './use-recent-payments';

const TODAY_TAKINGS_LIMIT = 200;

/**
 * Today's netted takings for the cash-desk header: reuses {@link useRecentPayments}
 * with a single-day (`from === to === today`) window, then derives the by-method
 * split client-side (SOU-198). Returns the underlying query so the card can render
 * loading/error states the same way the invoices/arrears screens do.
 */
export function useTodayTakings(): {
  readonly query: ReturnType<typeof useRecentPayments>;
  readonly summary: TakingsSummary;
} {
  const today = todayIso();
  const query = useRecentPayments({ from: today, to: today, limit: TODAY_TAKINGS_LIMIT });
  const summary = useMemo(() => summarizeTakings(query.data ?? []), [query.data]);
  return { query, summary };
}
