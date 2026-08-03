import { useTranslation } from 'react-i18next';
import { CalendarOff, Archive, CalendarSearch } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { HolidayStatus, HolidayView } from '../../lib/holidays/holiday-view';
import { HolidayTable } from './holiday-table';

export type HolidayListStatus = 'loading' | 'error' | 'empty' | 'empty-year' | 'ready';

type HolidayListContentProps = {
  status: HolidayListStatus;
  variant: HolidayStatus;
  holidays: readonly HolidayView[];
  onRetry: () => void;
  onCreate: () => void;
};

/**
 * Renders the correct state for one holidays list: loading, error, empty (the
 * whole scope), empty-year (nothing matches the year filter), or the table.
 */
export function HolidayListContent({
  status,
  variant,
  holidays,
  onRetry,
  onCreate,
}: HolidayListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <ErrorState
        icon={<CalendarOff className="h-5 w-5" aria-hidden="true" />}
        title={t('holidays.loadError.title')}
        description={t('holidays.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('holidays.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty-year') {
    return (
      <EmptyState
        icon={<CalendarSearch className="h-5 w-5" aria-hidden="true" />}
        title={t('holidays.yearEmpty.title')}
        description={t('holidays.yearEmpty.body')}
      />
    );
  }

  if (status === 'empty') {
    return variant === 'archived' ? (
      <EmptyState
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        title={t('holidays.archivedEmpty.title')}
        description={t('holidays.archivedEmpty.body')}
      />
    ) : (
      <EmptyState
        icon={<CalendarOff className="h-5 w-5" aria-hidden="true" />}
        title={t('holidays.empty.title')}
        description={t('holidays.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('holidays.empty.cta')}
          </Button>
        }
      />
    );
  }

  return <HolidayTable holidays={holidays} variant={variant} />;
}
