import { useHolidays } from '../../hooks/holiday/use-holidays';
import type { HolidayStatus } from '../../lib/holidays/holiday-view';
import { filterHolidaysByYear, type HolidayYearFilter } from '../../lib/holidays/holiday-years';
import { HolidayListContent, type HolidayListStatus } from './holiday-list-content';

/**
 * Connects one lifecycle list (active or archived) to its query, applies the
 * shared year filter, and derives the display state. Both tabs render this same
 * panel with a different `variant`.
 */
export function HolidayListPanel({
  variant,
  year,
  onCreate,
}: {
  variant: HolidayStatus;
  year: HolidayYearFilter;
  onCreate: () => void;
}) {
  const query = useHolidays(variant);
  const all = query.data ?? [];
  const holidays = filterHolidaysByYear(all, year);

  const status: HolidayListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : all.length === 0
        ? 'empty'
        : holidays.length === 0
          ? 'empty-year'
          : 'ready';

  return (
    <HolidayListContent
      status={status}
      variant={variant}
      holidays={holidays}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
