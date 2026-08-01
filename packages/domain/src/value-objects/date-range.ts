import type { WeekdayIndex } from './weekday';

/**
 * An inclusive range of civil calendar dates in strict `YYYY-MM-DD` form
 * (`start <= end`). Plain civil dates — no time, no zone — so they compare
 * lexicographically (= chronologically), exactly like {@link Holiday}'s date
 * fields. This is a materialization *window*, not a business entity: it carries
 * no envelope and is validated for well-formedness at the boundary (schema /
 * IPC), so the pure helpers here trust their input, mirroring `holidayCoversDate`.
 */
export type DateRange = { readonly start: string; readonly end: string };

/**
 * Parse a `YYYY-MM-DD` civil date to its UTC-midnight instant. Fixed-offset
 * slicing (not indexed access) keeps `noUncheckedIndexedAccess` happy. This is
 * pure calendar arithmetic via `Date.UTC` — never the wall clock — so it stays
 * deterministic and timezone-free (the domain's only time source is the `Clock`
 * port; this reads no "now").
 */
function toUtcMidnight(date: string): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC-midnight instant back to a `YYYY-MM-DD` civil date. */
function toCivilDate(instant: Date): string {
  const year = String(instant.getUTCFullYear()).padStart(4, '0');
  const month = String(instant.getUTCMonth() + 1).padStart(2, '0');
  const day = String(instant.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The weekday of a civil date, `0 = Sunday … 6 = Saturday` — the same
 * convention {@link WeekdayIndex} and `WeeklyRecurringSession.dayOfWeek` use
 * (it mirrors `Date.getUTCDay`). Used by the session generator to keep only the
 * dates in a range that fall on the recurrence's weekday.
 */
export function weekdayOf(date: string): WeekdayIndex {
  return toUtcMidnight(date).getUTCDay() as WeekdayIndex;
}

/**
 * Every civil date in `[start, end]`, inclusive, in chronological order; empty
 * when `end < start`. Stepping in UTC (`setUTCDate`) sidesteps DST — a day is
 * always exactly one increment — and normalizes month/year rollovers, so the
 * caller never does date math by hand.
 */
export function eachDateInRange(range: DateRange): readonly string[] {
  const dates: string[] = [];
  const cursor = toUtcMidnight(range.start);
  const end = toUtcMidnight(range.end);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toCivilDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
