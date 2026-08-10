import {
  windowsForWeekday,
  type CenterHoursOverride,
} from '../entities/center-hours-override';
import type { DayHours } from './session-conflict-policy';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';

/**
 * The effective opening windows for interactive session validation on `date` when
 * an active override covers it, or `undefined` when none does (SOU-165). Used by
 * the ad-hoc create/edit path to decide whether the static center hours or the
 * override's per-weekday windows govern the slot: `undefined` means "no override
 * in effect — keep checking against the static hours". An override that closes
 * `dayOfWeek` yields an empty window list (a defined value), which the hours check
 * then rejects as `closed`.
 */
export function overrideWindowsOn(
  date: string,
  dayOfWeek: WeekdayIndex,
  overrides: readonly CenterHoursOverride[],
): readonly TimeWindow[] | undefined {
  const active = activeOverrideOn(date, overrides);
  return active === null ? undefined : windowsForWeekday(active.hoursByWeekday, dayOfWeek);
}

/** The subset of an override the date resolution reads — decoupled from the envelope. */
export type OverrideOccurrence = Pick<
  CenterHoursOverride,
  'id' | 'dateRange' | 'hoursByWeekday'
>;

/**
 * Does `override` cover the civil date `date` (`YYYY-MM-DD`)? Inclusive on both
 * ends; string comparison is chronological for this format.
 */
export function overrideCoversDate(override: OverrideOccurrence, date: string): boolean {
  return override.dateRange.start <= date && date <= override.dateRange.end;
}

/**
 * The single override in effect on `date`, or `null` when none covers it. When
 * two overrides overlap the same date (an editing accident, not a normal state),
 * the one with the greatest `id` wins — ULIDs sort lexicographically by creation
 * time, so this deterministically prefers the most recently created override and,
 * because `id` is immutable, resolves identically on every synced device (never
 * by wall-clock `updatedAt`, which drifts).
 */
export function activeOverrideOn<T extends OverrideOccurrence>(
  date: string,
  overrides: readonly T[],
): T | null {
  let winner: T | null = null;
  for (const override of overrides) {
    if (!overrideCoversDate(override, date)) continue;
    if (winner === null || override.id > winner.id) winner = override;
  }
  return winner;
}

/**
 * The opening windows in effect on `date` for `dayOfWeek`, with override
 * precedence (SOU-165):
 *
 * - An override covering `date` wins: its per-weekday window list is returned
 *   verbatim (an empty list means the center is closed that day under the
 *   override).
 * - Otherwise the static weekday hours apply: an open day becomes a single
 *   window `[open, close]`, a closed day (or a weekday absent from `staticDay`)
 *   becomes an empty list.
 * - When no override covers `date` **and** `staticDay` is `null`, the caller has
 *   supplied no hours constraint at all: the result is `null`, meaning "do not
 *   enforce hours for this date" (the session generator materializes without a
 *   hours check, preserving its pre-SOU-165 behavior).
 */
export function resolveEffectiveWindows(
  date: string,
  dayOfWeek: WeekdayIndex,
  overrides: readonly CenterHoursOverride[],
  staticDay: DayHours | null,
): readonly TimeWindow[] | null {
  const override = activeOverrideOn(date, overrides);
  if (override !== null) return windowsForWeekday(override.hoursByWeekday, dayOfWeek);
  if (staticDay === null) return null;
  return dayHoursToWindows(staticDay);
}

/** A static weekday row as a window list: `[]` when closed, one window otherwise. */
export function dayHoursToWindows(day: DayHours): readonly TimeWindow[] {
  if (day.open === null || day.close === null) return [];
  return [{ open: day.open, close: day.close }];
}
