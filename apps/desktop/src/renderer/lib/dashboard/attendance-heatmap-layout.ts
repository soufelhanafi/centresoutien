import type { AttendanceHeatmapCellView } from './dashboard-view';

/** Days per calendar week — heatmap rows, Monday (0) through Sunday (6). */
export const HEATMAP_ROWS = 7;

/** One column of the heatmap: a calendar week, `cells[0]` = Monday … `cells[6]` = Sunday. */
export type HeatmapColumn = {
  /** Local `Date` at midnight of this column's Monday — drives the month labels. */
  readonly weekStart: Date;
  readonly cells: readonly (AttendanceHeatmapCellView | null)[];
};

const MS_PER_DAY = 86_400_000;

/** Parses a `YYYY-MM-DD` cell date at local midnight so the day never shifts by time zone. */
function parseCellDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Monday-based weekday index: Monday → 0 … Sunday → 6. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Buckets chronological daily cells into calendar-week columns (Monday-first),
 * padding the first and last weeks with `null` so every column is 7 rows tall.
 * Pure and locale-free: the component formats the labels from each column's
 * `weekStart`. Layout order stays oldest→newest; RTL mirroring is the grid's job.
 */
export function buildHeatmapColumns(cells: readonly AttendanceHeatmapCellView[]): readonly HeatmapColumn[] {
  const first = cells[0];
  if (first === undefined) return [];

  const gridStart = addDays(parseCellDate(first.date), -mondayIndex(parseCellDate(first.date)));
  const columns: { weekStart: Date; cells: (AttendanceHeatmapCellView | null)[] }[] = [];

  for (const cell of cells) {
    const dayOffset = wholeDaysBetween(gridStart, parseCellDate(cell.date));
    const columnIndex = Math.floor(dayOffset / HEATMAP_ROWS);
    const rowIndex = dayOffset % HEATMAP_ROWS;
    let column = columns[columnIndex];
    if (column === undefined) {
      column = { weekStart: addDays(gridStart, columnIndex * HEATMAP_ROWS), cells: Array(HEATMAP_ROWS).fill(null) };
      columns[columnIndex] = column;
    }
    column.cells[rowIndex] = cell;
  }

  return columns.map((column) => column ?? { weekStart: gridStart, cells: Array(HEATMAP_ROWS).fill(null) });
}
