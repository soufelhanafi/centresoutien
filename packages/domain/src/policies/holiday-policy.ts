import type { Holiday } from '../entities/holiday';

/**
 * The minimal shape the holiday date checks read — decoupled from the full
 * envelope so callers can pass a projection (or a boundary DTO) without the sync
 * columns. Carries `id`/`name` so a match can be reported back to the user.
 */
export type HolidayOccurrence = Pick<Holiday, 'id' | 'name' | 'kind' | 'startDate' | 'endDate'>;

/** The `MM-DD` slice of a strict `YYYY-MM-DD` date. */
function monthDay(date: string): string {
  return date.slice(5);
}

/**
 * Does `holiday` cover the calendar date `date` (`YYYY-MM-DD`)? Pure — no clock,
 * no I/O.
 *
 * - `lunar` holidays are pinned to one specific year: the date must fall within
 *   the inclusive `[startDate, endDate]` range as full dates.
 * - `fixed` holidays recur **every year on the same month-day**, so only the
 *   `MM-DD` window matters. A same-year window (`start <= end`) matches a date
 *   inside it; a window that wraps the year boundary (e.g. Dec 24 → Jan 04, whose
 *   `MM-DD` runs backwards) matches a date on **either** side of new year.
 */
export function holidayCoversDate(holiday: HolidayOccurrence, date: string): boolean {
  if (holiday.kind === 'lunar') {
    return holiday.startDate <= date && date <= holiday.endDate;
  }
  const day = monthDay(date);
  const start = monthDay(holiday.startDate);
  const end = monthDay(holiday.endDate);
  return start <= end ? start <= day && day <= end : day >= start || day <= end;
}

/**
 * The first holiday covering `date`, or `null` when none does. The order reflects
 * the caller's supplied list; callers that care about determinism sort first.
 * This is the `isHolidayOn` primitive the scheduling policy and the future
 * session generator (SOU-56) share.
 */
export function holidayOn(
  date: string,
  holidays: readonly HolidayOccurrence[],
): HolidayOccurrence | null {
  return holidays.find((holiday) => holidayCoversDate(holiday, date)) ?? null;
}
