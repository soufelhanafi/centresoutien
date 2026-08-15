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
