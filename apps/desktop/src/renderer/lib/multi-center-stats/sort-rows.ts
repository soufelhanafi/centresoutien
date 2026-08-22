import type { MultiCenterStatsRowView } from './multi-center-stats-view';

/** The sortable columns. `displayName` sorts alphabetically; the rest are numeric. */
export type MultiCenterStatsSortKey =
  | 'displayName'
  | 'revenueMad'
  | 'studentCount'
  | 'unpaidRate'
  | 'momGrowthPercent';

export type SortDirection = 'asc' | 'desc';

export type MultiCenterStatsSort = {
  readonly key: MultiCenterStatsSortKey;
  readonly direction: SortDirection;
};

/**
 * Filters rows by a case-insensitive substring of the center's display name or
 * code. An empty query returns the rows unchanged.
 */
export function filterRowsByName(
  rows: readonly MultiCenterStatsRowView[],
  query: string,
): readonly MultiCenterStatsRowView[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return rows;
  return rows.filter(
    (row) =>
      row.displayName.toLocaleLowerCase().includes(needle) ||
      row.centerCode.toLocaleLowerCase().includes(needle),
  );
}

/**
 * Sorts a copy of `rows` by `sort`. `null` figures (no baseline / nothing billed)
 * and `unavailable` centers always sink to the bottom regardless of direction, so
 * a missing value never masquerades as a high or low real figure.
 */
export function sortRows(
  rows: readonly MultiCenterStatsRowView[],
  sort: MultiCenterStatsSort,
): readonly MultiCenterStatsRowView[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (left.unavailable !== right.unavailable) {
      return left.unavailable ? 1 : -1;
    }
    if (sort.key === 'displayName') {
      return factor * left.displayName.localeCompare(right.displayName);
    }
    const leftValue = left[sort.key];
    const rightValue = right[sort.key];
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return factor * (leftValue - rightValue);
  });
}
