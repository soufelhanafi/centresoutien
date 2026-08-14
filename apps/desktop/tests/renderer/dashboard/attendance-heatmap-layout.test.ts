import { describe, expect, it } from 'vitest';
import {
  buildHeatmapColumns,
  buildMonthLabelKeys,
  HEATMAP_ROWS,
} from '../../../src/renderer/lib/dashboard/attendance-heatmap-layout';
import type { AttendanceHeatmapCellView } from '../../../src/renderer/lib/dashboard/dashboard-view';

function cell(date: string, ratePercent: number | null = 0, isHoliday = false): AttendanceHeatmapCellView {
  return { date, ratePercent, isHoliday, breakdown: { present: 0, absent: 0, excused: 0, late: 0 } };
}

/** A contiguous run of daily cells starting at `start`, chronological like the read model. */
function dailyRun(start: string, days: number): AttendanceHeatmapCellView[] {
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];
  return Array.from({ length: days }, (_day, offset) => {
    const date = new Date(year, month - 1, day + offset);
    // Format the LOCAL date components — `toISOString()` would shift the day back
    // in any positive-UTC-offset timezone and break the week grid (SOU-255).
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return cell(`${yyyy}-${mm}-${dd}`);
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

describe('buildMonthLabelKeys', () => {
  it('labels the first column from its first real cell, not the padded Monday', () => {
    // 2026-03-01 is a Sunday → its week starts Mon 2026-02-23, but the window
    // opens in March. The old weekStart-based labeler mislabelled this February.
    const [firstKey] = buildMonthLabelKeys(buildHeatmapColumns(dailyRun('2026-03-01', 7)));
    expect(firstKey).toBe('2026-03');
  });

  it('labels a midweek month transition on the column that holds the 1st, not a week late', () => {
    // 2026-04-01 is a Wednesday, mid-week — the column that contains it (not the
    // following Monday's column) must carry April's header.
    const columns = buildHeatmapColumns(dailyRun('2026-03-23', 21)); // Mon 23 Mar → Sun 12 Apr
    const keys = buildMonthLabelKeys(columns);
    expect(keys[0]).toBe('2026-03'); // first column → its start month
    expect(keys[1]).toBe('2026-04'); // week of Mon 30 Mar → Sun 5 Apr holds 1 Apr
    expect(keys[2]).toBeNull(); // no new month starts in the third week
  });

  it('emits each month at most once and null-pads label-less columns', () => {
    const keys = buildMonthLabelKeys(buildHeatmapColumns(dailyRun('2026-01-05', 70)));
    const labelled = keys.filter((key): key is string => key !== null);
    expect(new Set(labelled).size).toBe(labelled.length);
    expect(labelled).toContain('2026-01');
    expect(labelled).toContain('2026-02');
    expect(labelled).toContain('2026-03');
  });

  it('returns no labels for an empty window', () => {
    expect(buildMonthLabelKeys(buildHeatmapColumns([]))).toEqual([]);
  });
});
