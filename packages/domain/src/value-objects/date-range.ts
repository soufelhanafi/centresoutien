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

/** Days in a Gregorian month (`month` is 1–12) — pure, leap-year-aware. Exported
 *  so `value-objects/month.ts` can compute a calendar month's last day without
 *  duplicating the leap-year rule. */
export function daysInMonth(year: number, month: number): number {
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
 * Proleptic-Gregorian day number (Fliegel & Van Flandern), used only as a
 * subtraction key for {@link daysBetween} — never surfaced on its own, so it
 * needs no calendar-correctness beyond "difference of two of these is a day
 * count".
 */
function toDayNumber(date: string): number {
  const { year, month, day } = parts(date);
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * Whole civil days from `from` to `to` (positive when `to` is later) — pure
 * integer arithmetic, no `Date`, so the domain's only time source stays the
 * injected `Clock` port. Backs invoice-aging's day-based overdue buckets.
 */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * `date` shifted forward by `days` whole civil days (negative shifts backward) —
 * pure integer arithmetic with month/year rollover, no `Date`, no timezone, no
 * DST. Backs {@link endDateAfterWeekdayOccurrences}, which needs to walk forward
 * by an arbitrary day count rather than one day at a time.
 */
export function addDays(date: string, days: number): string {
  let { year, month, day } = parts(date);
  let remaining = days;
  while (remaining > 0) {
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    remaining -= 1;
  }
  while (remaining < 0) {
    day -= 1;
    if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
    remaining += 1;
  }
  return format(year, month, day);
}

/**
 * The end date of a window starting at `startDate` that contains exactly
 * `occurrenceCount` civil dates falling on `weekday` — the first being
 * `startDate` itself or the next later date on that weekday, the rest one
 * week apart. Backs the session generator's `{ startDate, occurrenceCount }`
 * range variant (SOU-161): each weekly-recurring-session template is
 * single-weekday, so converting an occurrence count to a concrete
 * `[start, end]` materialization window is computed once per template's own
 * weekday, independent of the caller's other templates. A holiday inside the
 * window still counts toward the day span here — {@link GenerateSessions}
 * skips it when materializing, so the occurrence count is a sizing target, not
 * a guaranteed count, exactly like its own holiday-skip semantics.
 */
export function endDateAfterWeekdayOccurrences(
  startDate: string,
  weekday: WeekdayIndex,
  occurrenceCount: number,
): string {
  if (!Number.isInteger(occurrenceCount) || occurrenceCount < 1) {
    throw new RangeError(`occurrenceCount must be a positive integer, got ${occurrenceCount}.`);
  }
  const offsetToFirstOccurrence = (weekday - weekdayOf(startDate) + 7) % 7;
  const offsetToLastOccurrence = offsetToFirstOccurrence + 7 * (occurrenceCount - 1);
  return addDays(startDate, offsetToLastOccurrence);
}

/**
 * The civil date of `weekday` inside the Sunday-started week that contains
 * `reference` (SOU-165). A weekly-recurring-session template carries no single
 * date, only a `dayOfWeek`; the interactive planner it is created/edited from
 * always renders the current real week, so "does an active override govern this
 * slot?" is answered against the occurrence of that weekday in the same week as
 * `reference` (the injected clock's civil date). Sunday-first mirrors
 * {@link weekdayOf}'s `0 = Sunday` convention.
 */
export function weekdayInWeekOf(reference: string, weekday: WeekdayIndex): string {
  const sundayStart = addDays(reference, -weekdayOf(reference));
  return addDays(sundayStart, weekday);
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
