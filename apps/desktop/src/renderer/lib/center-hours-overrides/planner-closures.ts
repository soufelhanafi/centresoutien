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
 * Bridges a dated override onto the weekly planner grid (SOU-165). An active
 * override fully replaces the base weekly hours for the visible week — its
 * `hoursByWeekday` covers all seven days — so the grid grays out exactly the
 * closed time of each day, including the mid-day iftar gap between two windows.
 * With no active override the base weekly hours drive the grid unchanged.
 */

function overrideDayIntervals(
  override: CenterHoursOverrideView,
  day: WeekdayIndex,
): MinuteInterval[] {
  return (override.hoursByWeekday[day] ?? []).map((window) => ({
    start: timeToMinutes(window.open),
    end: timeToMinutes(window.close),
  }));
}

/**
 * The visible hour window. An active override's windows set the bounds so its
 * (possibly later) hours stay in view; a fully-closed override period falls back
 * to the base weekly range so the grid never collapses to nothing.
 */
export function deriveOverrideAwareRange(
  week: readonly WeekdayHoursInput[],
  activeOverride: CenterHoursOverrideView | null,
): TimeRange {
  if (activeOverride === null) return deriveCenterHoursRange(week);
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const day of WEEKDAYS) {
    for (const interval of overrideDayIntervals(activeOverride, day)) {
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
 * The closed (hatched) segments per weekday. Under an active override every day
 * hatches the complement of its open windows within `range`. Without one, the
 * base rule holds: a closed day hatches the whole column; an open day has no
 * partial hatch, preserving the existing planner look.
 */
export function deriveClosedSegmentsByDay(
  week: readonly WeekdayHoursInput[],
  activeOverride: CenterHoursOverrideView | null,
  range: TimeRange,
): ReadonlyMap<WeekdayIndex, readonly MinuteInterval[]> {
  const byDay = new Map<WeekdayIndex, readonly MinuteInterval[]>();
  const fullRange: MinuteInterval = { start: range.startHour * 60, end: range.endHour * 60 };

  for (const day of WEEKDAYS) {
    if (activeOverride !== null) {
      byDay.set(day, complementWithinRange(overrideDayIntervals(activeOverride, day), range));
      continue;
    }
    const row = week.find((entry) => entry.dayOfWeek === day);
    const closed = row === undefined || row.open === null || row.close === null;
    byDay.set(day, closed ? [fullRange] : []);
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
