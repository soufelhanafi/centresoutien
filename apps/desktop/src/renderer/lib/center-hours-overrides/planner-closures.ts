import { WEEKDAYS, type WeekdayIndex, type WeekdayHoursInput } from '@centresoutien/domain';
import {
  complementWithinRange,
  deriveCenterHoursRange,
  timeToMinutes,
  type MinuteInterval,
  type TimeRange,
} from '../planning/time-range';
import type { CenterHoursOverrideView } from './override-view';

/**
 * Bridges dated overrides onto the weekly planner grid (SOU-165). The grid shows
 * seven weekday columns of one concrete civil week (pinned to today), so each
 * column is resolved against ITS OWN date: the override active on that date wins
 * and its per-weekday windows drive the gray-out (including the mid-day iftar
 * gap); a column no override covers keeps the static weekly hours unchanged. This
 * matters on a Ramadan boundary week, where some visible days fall inside the
 * override range and some outside — a single-override paint would gray the wrong
 * columns even though domain enforcement is already date-precise per day.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoToUtcDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function utcDateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The seven concrete `YYYY-MM-DD` dates of the Sunday-first week containing
 * `anchorDate`, keyed by the domain's canonical `WeekdayIndex` (`0 = Sunday`).
 * The planner renders columns in that same order, so column `d` maps to this
 * map's `d`. UTC arithmetic keeps the arithmetic DST-proof — only the civil date
 * matters, never the wall-clock instant.
 */
export function weekColumnDates(anchorDate: string): ReadonlyMap<WeekdayIndex, string> {
  const anchor = isoToUtcDate(anchorDate);
  const sundayMillis = anchor.getTime() - anchor.getUTCDay() * MS_PER_DAY;
  const dates = new Map<WeekdayIndex, string>();
  for (const day of WEEKDAYS) dates.set(day, utcDateToIso(new Date(sundayMillis + day * MS_PER_DAY)));
  return dates;
}

/** The inclusive `{ start, end }` civil-date span covered by a week's columns. */
export function weekDateSpan(weekDates: ReadonlyMap<WeekdayIndex, string>): {
  start: string;
  end: string;
} {
  const sorted = [...weekDates.values()].sort();
  const start = sorted[0] ?? '';
  return { start, end: sorted[sorted.length - 1] ?? start };
}

/**
 * The override in effect on `date`, or `null` when none covers it. Mirrors the
 * domain's `activeOverrideOn` tie-break (greatest `id` wins — ULIDs are immutable
 * and sort by creation, so this resolves identically on every synced device and
 * never by drift-prone wall-clock). Replicated here rather than imported because
 * the renderer's `CenterHoursOverrideView.id` is an unbranded string and cannot
 * satisfy the domain function's branded-`CenterHoursOverrideId` generic bound.
 */
function activeOverrideForDate(
  date: string,
  overrides: readonly CenterHoursOverrideView[],
): CenterHoursOverrideView | null {
  let winner: CenterHoursOverrideView | null = null;
  for (const override of overrides) {
    if (date < override.dateRange.start || date > override.dateRange.end) continue;
    if (winner === null || override.id > winner.id) winner = override;
  }
  return winner;
}

function overrideDayIntervals(
  override: CenterHoursOverrideView,
  day: WeekdayIndex,
): MinuteInterval[] {
  return (override.hoursByWeekday[day] ?? []).map((window) => ({
    start: timeToMinutes(window.open),
    end: timeToMinutes(window.close),
  }));
}

function staticDayIntervals(
  week: readonly WeekdayHoursInput[],
  day: WeekdayIndex,
): MinuteInterval[] {
  const row = week.find((entry) => entry.dayOfWeek === day);
  if (row === undefined || row.open === null || row.close === null) return [];
  return [{ start: timeToMinutes(row.open), end: timeToMinutes(row.close) }];
}

/** The open windows governing one column: the override's when covered, else static. */
function effectiveDayIntervals(
  week: readonly WeekdayHoursInput[],
  overrides: readonly CenterHoursOverrideView[],
  weekDates: ReadonlyMap<WeekdayIndex, string>,
  day: WeekdayIndex,
): { intervals: MinuteInterval[]; covered: boolean } {
  const date = weekDates.get(day);
  const override = date === undefined ? null : activeOverrideForDate(date, overrides);
  if (override !== null) return { intervals: overrideDayIntervals(override, day), covered: true };
  return { intervals: staticDayIntervals(week, day), covered: false };
}

/**
 * The visible hour window: the union of every column's effective open windows, so
 * a day opening 21:00–23:00 under an override still fits on the axis while its
 * siblings show static hours. When nothing is open anywhere it falls back to the
 * base weekly range so the grid never collapses to nothing.
 */
export function deriveOverrideAwareRange(
  week: readonly WeekdayHoursInput[],
  overrides: readonly CenterHoursOverrideView[],
  weekDates: ReadonlyMap<WeekdayIndex, string>,
): TimeRange {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const day of WEEKDAYS) {
    for (const interval of effectiveDayIntervals(week, overrides, weekDates, day).intervals) {
      start = Math.min(start, interval.start);
      end = Math.max(end, interval.end);
    }
  }
  if (start > end) return deriveCenterHoursRange(week);
  const startHour = Math.floor(start / 60);
  const endHour = Math.ceil(end / 60);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  return { startHour, endHour, hours };
}

/**
 * The closed (hatched) segments per weekday, resolved per column against its own
 * date. A day an override covers hatches the complement of its open windows within
 * `range` (edges + any iftar gap). A day under the static rule keeps the existing
 * planner look: a closed day hatches the whole column, an open day has no partial
 * hatch even when a sibling column widened the visible range.
 */
export function deriveClosedSegmentsByDay(
  week: readonly WeekdayHoursInput[],
  overrides: readonly CenterHoursOverrideView[],
  weekDates: ReadonlyMap<WeekdayIndex, string>,
  range: TimeRange,
): ReadonlyMap<WeekdayIndex, readonly MinuteInterval[]> {
  const byDay = new Map<WeekdayIndex, readonly MinuteInterval[]>();
  const fullRange: MinuteInterval = { start: range.startHour * 60, end: range.endHour * 60 };

  for (const day of WEEKDAYS) {
    const { intervals, covered } = effectiveDayIntervals(week, overrides, weekDates, day);
    if (covered) {
      byDay.set(day, complementWithinRange(intervals, range));
      continue;
    }
    byDay.set(day, intervals.length === 0 ? [fullRange] : []);
  }
  return byDay;
}

/** True when a day's closed segments span the entire visible range (fully closed). */
export function isFullyClosed(
  segments: readonly MinuteInterval[],
  range: TimeRange,
): boolean {
  return (
    segments.length === 1 &&
    segments[0]?.start === range.startHour * 60 &&
    segments[0]?.end === range.endHour * 60
  );
}
