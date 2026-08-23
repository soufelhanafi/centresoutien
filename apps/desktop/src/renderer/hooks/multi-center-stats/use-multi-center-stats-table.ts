import { useMemo, useState } from 'react';
import {
  filterRowsByName,
  sortRows,
  type MultiCenterStatsSort,
  type MultiCenterStatsSortKey,
} from '../../lib/multi-center-stats/sort-rows';
import type { MultiCenterStatsRowView } from '../../lib/multi-center-stats/multi-center-stats-view';

const DEFAULT_SORT: MultiCenterStatsSort = { key: 'revenueMad', direction: 'desc' };

/**
 * Owns the table's filter text and sort state and derives the visible rows.
 * Sorting/filtering are memoized so re-renders (≤20 rows) never recompute
 * needlessly — no windowing library is warranted at this size (SOU-106).
 * Toggling the active column flips direction; a new column starts descending
 * (highest-first, the figure operators scan for).
 */
export function useMultiCenterStatsTable(rows: readonly MultiCenterStatsRowView[]) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<MultiCenterStatsSort>(DEFAULT_SORT);

  const visibleRows = useMemo(
    () => sortRows(filterRowsByName(rows, filter), sort),
    [rows, filter, sort],
  );

  const onSort = (key: MultiCenterStatsSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    );
  };

  return { filter, setFilter, sort, onSort, visibleRows };
}
