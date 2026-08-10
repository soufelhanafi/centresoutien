import type { Brand } from '../value-objects/brand';
import type { DateRange } from '../value-objects/date-range';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for center-hours-override rows: `cho_01HW…`. */
export const CENTER_HOURS_OVERRIDE_ID_PREFIX = 'cho';

export type CenterHoursOverrideId = Brand<string, 'CenterHoursOverrideId'>;

/**
 * One window list per weekday, indexed `0 = Sunday … 6 = Saturday`. A weekday's
 * empty list means the center is closed that day for the duration of the
 * override. Each list is ordered and non-overlapping (see
 * {@link areOrderedNonOverlappingWindows}), so a day can carry an iftar break
 * (`09:00–15:00` then `21:00–23:00`) as two windows.
 */
export type WeeklyTimeWindows = readonly [
  readonly TimeWindow[],
  readonly TimeWindow[],
  readonly TimeWindow[],
  readonly TimeWindow[],
  readonly TimeWindow[],
  readonly TimeWindow[],
  readonly TimeWindow[],
];

/**
 * A time-boxed replacement of the center's weekly opening hours for an inclusive
 * civil-date range — the Ramadan-driven schedule shift (SOU-165). While an
 * override is in effect for a date, its per-weekday {@link TimeWindow} lists take
 * precedence over the static {@link CenterHours}; outside the range, static hours
 * apply unchanged. Not people-like, so no `naturalKey`. Soft-delete only. The
 * envelope columns follow the standard template.
 *
 * Unlike {@link CenterHours} (seven independently-versioned weekday rows), an
 * override is a single row carrying the whole week for its date range, because
 * the seven weekdays of one Ramadan are edited and reasoned about together — the
 * range is the unit, not the weekday.
 */
export type CenterHoursOverride = EntityEnvelope & {
  readonly id: CenterHoursOverrideId;
  dateRange: DateRange; // inclusive [start, end] civil dates, 'YYYY-MM-DD'
  hoursByWeekday: WeeklyTimeWindows;
};

/**
 * The window list this override applies on `dayOfWeek`. A fixed-index read of the
 * seven-tuple; an empty list means the day is closed under the override.
 */
export function windowsForWeekday(
  hoursByWeekday: WeeklyTimeWindows,
  dayOfWeek: WeekdayIndex,
): readonly TimeWindow[] {
  return hoursByWeekday[dayOfWeek];
}
