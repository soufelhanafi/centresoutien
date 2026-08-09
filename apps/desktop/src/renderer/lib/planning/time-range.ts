import { type WeekdayHoursInput } from '@centresoutien/domain';
import type { PlannerSessionView } from './planner-view';

/** Default visible window when no day of the week is open: 08:00 → 20:00. */
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

/** `'HH:mm'` → minutes since midnight (`'09:30'` → 570). */
export function timeToMinutes(time: string): number {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  return hours * 60 + minutes;
}

/** The vertical span the grid renders, as whole hours. */
export type TimeRange = {
  /** First visible hour (0–23), floored from the earliest opening time. */
  readonly startHour: number;
  /** Last visible hour boundary (1–24), ceiled from the latest closing time. */
  readonly endHour: number;
  /** The hour labels down the gutter, e.g. `[8, 9, … 20]`. */
  readonly hours: readonly number[];
};

/** The grid's minute-of-day bounds, spanning every open day of the week. */
export type GridBounds = {
  readonly start: number;
  readonly end: number;
};

/**
 * The grid's minute bounds: the earliest opening and the latest closing time
 * across the week's open days. Closed days (`open` or `close` null) are excluded
 * from the min/max; when no day is open the grid falls back to the default
 * 08:00–20:00 window. Sessions never extend the bounds — the grid shows exactly
 * what the center says it is open for (SOU-184).
 */
export function getGridBounds(week: readonly WeekdayHoursInput[]): GridBounds {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const row of week) {
    if (row.open === null || row.close === null) continue;
    start = Math.min(start, timeToMinutes(row.open));
    end = Math.max(end, timeToMinutes(row.close));
  }
  if (start > end) return { start: DEFAULT_START_HOUR * 60, end: DEFAULT_END_HOUR * 60 };
  return { start, end };
}

/**
 * The visible hour window derived from the center's weekly hours: floor the
 * earliest open and ceil the latest close to whole hours, filling every hour in
 * between. A 22:00 closing stays visible even when no session is scheduled that
 * late (SOU-184). A close after 23:00 ceils to the end-of-day boundary hour 24.
 */
export function deriveCenterHoursRange(week: readonly WeekdayHoursInput[]): TimeRange {
  const { start, end } = getGridBounds(week);
  const startHour = Math.floor(start / 60);
  const endHour = Math.ceil(end / 60);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  return { startHour, endHour, hours };
}

/** The day indexes whose rows are closed and must render hatched in the grid. */
export function deriveClosedDays(week: readonly WeekdayHoursInput[]): ReadonlySet<number> {
  const closed = new Set<number>();
  for (const row of week) {
    if (row.open === null || row.close === null) closed.add(row.dayOfWeek);
  }
  return closed;
}

/** A block's vertical placement inside its day column, as percentages of height. */
export type BlockPosition = {
  readonly topPercent: number;
  readonly heightPercent: number;
};

/**
 * Positions a session vertically within the range: `top` and `height` as a
 * percentage of the column height, so the block scales with any row height the
 * grid chooses. Horizontal placement (which day, RTL mirroring) is the grid's
 * job, not this function's. Out-of-range sessions clamp to the visible edges —
 * a session created when the range was wider stays visible after the center
 * narrows its hours (SOU-184).
 */
export function blockPosition(session: PlannerSessionView, range: TimeRange): BlockPosition {
  const rangeStart = range.startHour * 60;
  const totalMinutes = (range.endHour - range.startHour) * 60;
  const top = Math.min(100, Math.max(0, ((timeToMinutes(session.start) - rangeStart) / totalMinutes) * 100));
  const bottom = Math.min(100, Math.max(0, ((timeToMinutes(session.end) - rangeStart) / totalMinutes) * 100));
  return { topPercent: top, heightPercent: Math.max(0, bottom - top) };
}

/**
 * The gutter label for a whole-hour tick, `'HH:00'`. The end-of-day boundary
 * hour 24 renders as `'24:00'` — the bottom label when a center stays open past
 * 23:00, so a 23:30 close still shows sessions up to that hour.
 */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
