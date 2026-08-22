import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableHeader, TableRow, TableCell } from '@centresoutien/ui';
import type {
  MultiCenterStatsSort,
  MultiCenterStatsSortKey,
} from '../../lib/multi-center-stats/sort-rows';
import type { MultiCenterStatsRowView } from '../../lib/multi-center-stats/multi-center-stats-view';
import { SortableColumnHeader } from './sortable-column-header';
import { MultiCenterStatsRow } from './multi-center-stats-row';

type Column = { key: MultiCenterStatsSortKey; labelKey: string; numeric: boolean };

const COLUMNS: readonly Column[] = [
  { key: 'displayName', labelKey: 'multiCenterStats.columns.center', numeric: false },
  { key: 'revenueMad', labelKey: 'multiCenterStats.columns.revenue', numeric: true },
  { key: 'studentCount', labelKey: 'multiCenterStats.columns.students', numeric: true },
  { key: 'unpaidRate', labelKey: 'multiCenterStats.columns.unpaidRate', numeric: true },
  { key: 'momGrowthPercent', labelKey: 'multiCenterStats.columns.momGrowth', numeric: true },
];

type MultiCenterStatsTableProps = {
  rows: readonly MultiCenterStatsRowView[];
  sort: MultiCenterStatsSort;
  onSort: (key: MultiCenterStatsSortKey) => void;
  locale: string;
};

/** The per-center comparison table. Rows arrive already sorted and filtered. */
export function MultiCenterStatsTable({ rows, sort, onSort, locale }: MultiCenterStatsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <SortableColumnHeader
                key={column.key}
                columnKey={column.key}
                label={t(column.labelKey)}
                numeric={column.numeric}
                sort={sort}
                onSort={onSort}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-8 text-center text-sm text-muted-foreground">
                {t('multiCenterStats.table.noResults')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => <MultiCenterStatsRow key={row.centreId} row={row} locale={locale} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
