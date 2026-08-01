import type { WeekdayIndex } from './weekday';

/**
 * An inclusive range of civil calendar dates in strict `YYYY-MM-DD` form
 * (`start <= end`). Plain civil dates — no time, no zone — so they compare
 * lexicographically (= chronologically), exactly like a Holiday's date fields.
 * This is a materialization *window*, not a business entity: it carries no
 * envelope and is validated for well-formedness at the boundary (schema / IPC),
 * so the pure helpers here trust their input, mirroring `holidayCoversDate`.
 */
export type DateRange = { readonly start: string; readonly end: string };

/**
 * Split a strict `YYYY-MM-DD` civil date into numeric parts. Fixed-offset
 * slicing (not indexed access) keeps `noUncheckedIndexedAccess` happy.
 */
function parts(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Days in a Gregorian month (`month` is 1–12) — pure, leap-year-aware. */
function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/** Zero-pad and reassemble numeric parts into a `YYYY-MM-DD` civil date. */
function format(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The weekday of a civil date, `0 = Sunday … 6 = Saturday` — the same
 * convention {@link WeekdayIndex} and `WeeklyRecurringSession.dayOfWeek` use
 * (it mirrors `Date.getUTCDay`). Computed with Sakamoto's algorithm in pure
 * integer arithmetic — never `new Date`, so the domain's only time source stays
 * the injected `Clock` port. Used by the session generator to keep only the
 * dates in a range that fall on the recurrence's weekday.
 */
export function weekdayOf(date: string): WeekdayIndex {
  const { year, month, day } = parts(date);
  // Sakamoto's per-month shift table; year is rolled back for Jan/Feb.
  const monthShift = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const shift = monthShift[month - 1] ?? 0;
  const index =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + shift + day) % 7;
  return index as WeekdayIndex;
}

/**
 * Every civil date in `[start, end]`, inclusive, in chronological order; empty
 * when `end < start`. Steps one civil day at a time with month/year rollover —
 * no `Date`, no timezone, no DST — so a day is always exactly one increment and
 * the caller never does date math by hand.
 */
export function eachDateInRange(range: DateRange): readonly string[] {
  const dates: string[] = [];
  let { year, month, day } = parts(range.start);
  let current = format(year, month, day);
  while (current <= range.end) {
    dates.push(current);
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    current = format(year, month, day);
  }
  return dates;
}
