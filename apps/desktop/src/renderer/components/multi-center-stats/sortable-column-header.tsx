import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { TableHead, cn } from '@centresoutien/ui';
import type {
  MultiCenterStatsSort,
  MultiCenterStatsSortKey,
  SortDirection,
} from '../../lib/multi-center-stats/sort-rows';

type SortableColumnHeaderProps = {
  columnKey: MultiCenterStatsSortKey;
  label: string;
  numeric: boolean;
  sort: MultiCenterStatsSort;
  onSort: (key: MultiCenterStatsSortKey) => void;
};

const ARIA_SORT: Record<SortDirection, 'ascending' | 'descending'> = {
  asc: 'ascending',
  desc: 'descending',
};

/** A column header whose button toggles the table's sort; the chevron shows the active direction. */
export function SortableColumnHeader({ columnKey, label, numeric, sort, onSort }: SortableColumnHeaderProps) {
  const active = sort.key === columnKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ChevronUp : ChevronDown;

  return (
    <TableHead
      scope="col"
      aria-sort={active ? ARIA_SORT[sort.direction] : 'none'}
      className={numeric ? 'text-end' : 'text-start'}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={cn(
          'inline-flex items-center gap-1 font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
          numeric && 'flex-row-reverse',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      </button>
    </TableHead>
  );
}
