import { TeacherUnavailableError } from '../errors/teacher-availability-errors';
import type { SessionTimeCandidate } from './session-conflict-policy';
import type { WeeklyTimeWindows } from '../entities/center-hours-override';
import type { EntityId } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';
import { timeWindowsContain } from '../value-objects/time-window';
import { addDays, weekdayOf, type DateRange } from '../value-objects/date-range';

/**
 * One teacher's availability constraints as the generator consumes them
 * (SOU-259). `weeklyWindows` is `null` when the teacher has no weekly pattern
 * configured — only exceptions then apply; a teacher with neither is simply
 * absent from the caller's map and never checked. Exceptions are inclusive
 * civil-date absence ranges.
 */
export type TeacherAvailabilityRules = {
  readonly weeklyWindows: WeeklyTimeWindows | null;
  readonly exceptions: readonly DateRange[];
};

// The concrete occurrence window a bounded weekly recurrence materializes over
// within a scheduling horizon (SOU-287): intersect the recurrence's validity
// bounds (`validFrom`/`validTo`, each `null` = unbounded on that side) with the
// caller's horizon — the manual create/edit planner's current week. Returns
// `null` when the intersection is empty, so the caller skips exception
// enforcement rather than labelling a horizon date the recurrence never
// materializes on (a one-off absence can then never warn about a phantom
// occurrence). Pure civil-date comparisons; no `Date`.
export function recurrenceMaterializationRange(
  validFrom: string | null,
  validTo: string | null,
  horizon: DateRange,
): DateRange | null {
  const start = validFrom === null ? horizon.start : laterOf(validFrom, horizon.start);
  const end = validTo === null ? horizon.end : earlierOf(validTo, horizon.end);
  if (end < start) return null;
  return { start, end };
}

const laterOf = (a: string, b: string): string => (a > b ? a : b);
const earlierOf = (a: string, b: string): string => (a < b ? a : b);

// Does a one-off absence cover a specific civil date? The dated-occurrence form
// of the exception check (SOU-287): an occurrence IS on one date, so no weekday
// alignment is needed — just the inclusive-range containment test.
export function absenceCoversDate(date: string, absence: DateRange): boolean {
  return absence.start <= date && date <= absence.end;
}

/**
 * Does at least one occurrence of `weekday` inside `range` fall within
 * `absence`? Pure integer date math (no `Date`): intersect the two inclusive
 * ranges, then ask whether the intersection — at most needing one weekday-align
 * step of ≤ 6 days — still contains a date on `weekday`. Backs the exception
 * check below; exported for direct table-driven testing of the alignment math.
 */
export function weekdayOccursWithin(
  weekday: WeekdayIndex,
  range: DateRange,
  absence: DateRange,
): boolean {
  const lo = range.start > absence.start ? range.start : absence.start;
  const hi = range.end < absence.end ? range.end : absence.end;
  if (hi < lo) return false;
  const offsetToWeekday = (weekday - weekdayOf(lo) + 7) % 7;
  return addDays(lo, offsetToWeekday) <= hi;
}

/**
 * The SOU-259 availability check for one generated block: `out-of-window` when
 * the teacher has a weekly pattern and the block does not sit inside any of
 * that weekday's windows (an empty day is a day off), else `exception` when a
 * one-off absence covers at least one concrete occurrence date of the block
 * within `materializationRange` (`null` range skips the exception check — a
 * weekly pattern carries no dates to test against). Returns `null` when the
 * teacher is available. Same return-not-throw shape as
 * {@link SessionConflictPolicy}: the availability conflict is a preview
 * warning, so the caller wraps the returned error, never throws it.
 */
export function teacherUnavailability(
  candidate: SessionTimeCandidate,
  teacherId: EntityId,
  rules: TeacherAvailabilityRules,
  materializationRange: DateRange | null,
): TeacherUnavailableError | null {
  if (rules.weeklyWindows !== null) {
    const windows = rules.weeklyWindows[candidate.dayOfWeek];
    if (!timeWindowsContain(windows, candidate.start, candidate.end)) {
      return new TeacherUnavailableError(
        teacherId,
        candidate.dayOfWeek,
        'out-of-window',
        windows,
        null,
      );
    }
  }
  if (materializationRange !== null) {
    for (const absence of rules.exceptions) {
      if (weekdayOccursWithin(candidate.dayOfWeek, materializationRange, absence)) {
        return new TeacherUnavailableError(
          teacherId,
          candidate.dayOfWeek,
          'exception',
          rules.weeklyWindows?.[candidate.dayOfWeek] ?? [],
          absence,
        );
      }
    }
  }
  return null;
}
