import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useRecentPayments } from '../../hooks/payments/use-recent-payments';
import type { RecentPaymentsQuery } from '../../lib/payments/recent-payment-view';
import { RecentPaymentRow } from './recent-payment-row';
import {
  ALL_METHODS,
  RecentPaymentsFilters,
  hasActiveRecentPaymentsFilters,
  type RecentPaymentsFilterState,
} from './recent-payments-filters';

const RECENT_FEED_LIMIT = 50;

function toRecentPaymentsQuery(filters: RecentPaymentsFilterState): RecentPaymentsQuery {
  return {
    limit: RECENT_FEED_LIMIT,
    ...(filters.from !== '' && { from: filters.from }),
    ...(filters.to !== '' && { to: filters.to }),
    ...(filters.method !== ALL_METHODS && { method: filters.method }),
  };
}

/** Append-only cross-invoice payment feed, most recent first (SOU-198), with a
 *  `paidOn` day-window + method filter bar (SOU-225). Filter state is owned by the
 *  parent `PaymentsPage` so it survives the Radix tab remount (leaving and
 *  re-entering the tab keeps the applied window/method instead of resetting). */
export function RecentPaymentsFeed({
  filters,
  onFiltersChange,
}: {
  filters: RecentPaymentsFilterState;
  onFiltersChange: (next: RecentPaymentsFilterState) => void;
}) {
  const { t } = useTranslation();
  const feedQuery = useMemo(() => toRecentPaymentsQuery(filters), [filters]);
  const query = useRecentPayments(feedQuery);
  const filtersActive = hasActiveRecentPaymentsFilters(filters);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4" aria-labelledby="recent-payments-title">
      <h2 id="recent-payments-title" className="text-sm font-semibold text-foreground">
        {t('payments.feed.title')}
      </h2>

      <RecentPaymentsFilters value={filters} onChange={onFiltersChange} />

      {query.isPending && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          icon={<History className="h-5 w-5" aria-hidden="true" />}
          title={t('payments.feed.loadError')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('payments.retry')}
            </Button>
          }
        />
      )}

      {query.data && query.data.length === 0 && (
        <EmptyState
          icon={<History className="h-5 w-5" aria-hidden="true" />}
          title={t(filtersActive ? 'payments.feed.noResultsTitle' : 'payments.feed.emptyTitle')}
          description={t(filtersActive ? 'payments.feed.noResultsBody' : 'payments.feed.emptyBody')}
        />
      )}

      {query.data && query.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {query.data.map((payment) => (
            <RecentPaymentRow key={payment.id} payment={payment} />
          ))}
        </ul>
      )}
    </section>
  );
}
