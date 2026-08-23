import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useMultiCenterStatsTable } from '../../hooks/multi-center-stats/use-multi-center-stats-table';
import { formatMonth, formatInteger } from '../../lib/format';
import type { MultiCenterStatsViewModel } from '../../lib/multi-center-stats/multi-center-stats-view';
import { MultiCenterStatsTotals } from './multi-center-stats-totals';
import { MultiCenterStatsToolbar } from './multi-center-stats-toolbar';
import { MultiCenterStatsTable } from './multi-center-stats-table';
import { MultiCenterStatsExportActions } from './multi-center-stats-export-actions';

/** The ready state: reporting month, org totals, sync caveat, filter, and the comparison table. */
export function MultiCenterStatsContent({
  view,
  locale,
}: {
  view: MultiCenterStatsViewModel;
  locale: string;
}) {
  const { t } = useTranslation();
  const { filter, setFilter, sort, onSort, visibleRows } = useMultiCenterStatsTable(view.rows);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{formatMonth(view.month, locale)}</p>
          <p className="text-xs text-muted-foreground">
            {t('multiCenterStats.header.centerCount', {
              available: formatInteger(view.totals.availableCenterCount, locale),
              total: formatInteger(view.totals.centerCount, locale),
            })}
          </p>
        </div>
        <MultiCenterStatsExportActions />
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t('multiCenterStats.header.syncCaveat')}</span>
      </p>

      <MultiCenterStatsTotals totals={view.totals} locale={locale} />

      <MultiCenterStatsToolbar value={filter} onChange={setFilter} />

      <MultiCenterStatsTable rows={visibleRows} sort={sort} onSort={onSort} locale={locale} />
    </div>
  );
}
