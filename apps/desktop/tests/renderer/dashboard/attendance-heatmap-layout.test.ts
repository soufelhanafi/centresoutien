import { describe, expect, it } from 'vitest';
import {
  buildHeatmapColumns,
  HEATMAP_ROWS,
} from '../../../src/renderer/lib/dashboard/attendance-heatmap-layout';
import type { AttendanceHeatmapCellView } from '../../../src/renderer/lib/dashboard/dashboard-view';

function cell(date: string, ratePercent: number | null = 0, isHoliday = false): AttendanceHeatmapCellView {
  return { date, ratePercent, isHoliday, breakdown: { present: 0, absent: 0, excused: 0, late: 0 } };
}

/** A contiguous run of daily cells starting at `start`, chronological like the read model. */
function dailyRun(start: string, days: number): AttendanceHeatmapCellView[] {
  const first = new Date(`${start}T00:00:00`);
  return Array.from({ length: days }, (_day, offset) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
    return cell(date.toISOString().slice(0, 10));
  });
}

describe('buildHeatmapColumns', () => {
  it('returns no columns for an empty window', () => {
    expect(buildHeatmapColumns([])).toEqual([]);
  });

  it('pads the leading partial week so every column has seven Monday-first rows', () => {
    // 2026-08-05 is a Wednesday → row 2; Monday/Tuesday of that week stay null.
    const [firstColumn] = buildHeatmapColumns([cell('2026-08-05')]);
    expect(firstColumn?.cells).toHaveLength(HEATMAP_ROWS);
    expect(firstColumn?.cells[0]).toBeNull();
    expect(firstColumn?.cells[1]).toBeNull();
    expect(firstColumn?.cells[2]?.date).toBe('2026-08-05');
    expect(firstColumn?.weekStart.getDay()).toBe(1); // Monday
  });

  it('opens a fresh column at each week boundary', () => {
    const columns = buildHeatmapColumns(dailyRun('2026-08-03', 14)); // two full Mon→Sun weeks
    expect(columns).toHaveLength(2);
    expect(columns[0]?.cells.every((slot) => slot !== null)).toBe(true);
    expect(columns[1]?.cells[0]?.date).toBe('2026-08-10');
  });
});
