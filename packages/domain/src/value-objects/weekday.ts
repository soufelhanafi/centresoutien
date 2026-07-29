/**
 * Weekday index, `0 = Sunday … 6 = Saturday` — the convention `Date.getUTCDay()`
 * uses. A literal union (not a branded number) so the compiler enforces the
 * range at every boundary and `switch`/`find` narrowing stays exhaustive.
 */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The seven weekday indices in order, Sunday first. */
export const WEEKDAYS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** True when `value` is an integer in `0..6`. */
export function isWeekdayIndex(value: number): value is WeekdayIndex {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}
