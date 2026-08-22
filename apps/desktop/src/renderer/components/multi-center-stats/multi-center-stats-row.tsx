import { useTranslation } from 'react-i18next';
import { TableCell, TableRow, cn } from '@centresoutien/ui';
import { formatMoneyMad, formatInteger, formatPercent } from '../../lib/format';
import type { MultiCenterStatsRowView } from '../../lib/multi-center-stats/multi-center-stats-view';
import { GrowthIndicator } from './growth-indicator';

const NUMERIC_CELL = 'text-end tabular-nums';

function CenterCell({ row }: { row: MultiCenterStatsRowView }) {
  return (
    <TableCell className="text-start">
      <span className="block font-medium text-foreground">{row.displayName}</span>
      <span className="block text-xs text-muted-foreground">{row.centerCode}</span>
    </TableCell>
  );
}

/** One comparison row. `unavailable` centers collapse their figures into a single
 *  "data unavailable" cell so a DB that could not be read never shows fake zeros. */
export function MultiCenterStatsRow({ row, locale }: { row: MultiCenterStatsRowView; locale: string }) {
  const { t } = useTranslation();

  if (row.unavailable) {
    return (
      <TableRow className="opacity-60">
        <CenterCell row={row} />
        <TableCell colSpan={4} className="text-start text-sm italic text-muted-foreground">
          {t('multiCenterStats.row.unavailable')}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <CenterCell row={row} />
      <TableCell className={cn(NUMERIC_CELL, 'font-medium text-foreground')}>
        {formatMoneyMad(row.revenueMad, locale)}
      </TableCell>
      <TableCell className={NUMERIC_CELL}>{formatInteger(row.studentCount, locale)}</TableCell>
      <TableCell className={NUMERIC_CELL}>
        {row.unpaidRate === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatPercent(row.unpaidRate * 100, locale)
        )}
      </TableCell>
      <TableCell className={NUMERIC_CELL}>
        <GrowthIndicator percent={row.momGrowthPercent} locale={locale} />
      </TableCell>
    </TableRow>
  );
}
