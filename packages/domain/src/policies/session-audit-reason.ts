import { toEntityId, type EntityId } from '../value-objects/ids';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { HolidayOccurrence } from './holiday-policy';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import type { DayHours } from './session-conflict-policy';
import type { TeacherAvailabilityRules } from './teacher-availability-policy';
import type { WeekdayIndex } from '../value-objects/weekday';
import { SessionConflictPolicy } from './session-conflict-policy';
import { resolveEffectiveWindows } from './center-hours-override-policy';
import { holidayOn } from './holiday-policy';
import { teacherUnavailability } from './teacher-availability-policy';
import { weekdayOf } from '../value-objects/date-range';

/**
 * Why a materialized session no longer sits in any valid window. Exactly one
 * reason, in precedence order: `on-holiday` (a holiday now covers its date), then
 * `outside-center-hours` (its fixed `[start, end]` no longer fits the effective
 * windows), then `outside-teacher-availability` (SOU-283: its teacher is now
 * scheduled outside their declared windows or on a one-off absence).
 */
export type SessionAuditReason =
  | 'outside-center-hours'
  | 'on-holiday'
  | 'outside-teacher-availability';

/** The current-effective-config lenses each occurrence is audited against. */
export type SessionAuditContext = {
  readonly holidays: readonly HolidayOccurrence[];
  readonly overrides: readonly CenterHoursOverride[];
  readonly staticDayByWeekday: ReadonlyMap<WeekdayIndex, DayHours>;
  readonly availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
};

/**
 * Classify one occurrence against the current effective hours/holidays/availability
 * in the fixed precedence holiday > hours > availability, so the verdict is one
 * unambiguous reason (or `null` when the occurrence still fits). Reuses the same
 * policies interactive scheduling trusts, never a parallel reimplementation.
 */
export function auditReasonFor(
  session: SessionOccurrenceView,
  context: SessionAuditContext,
): SessionAuditReason | null {
  if (holidayOn(session.date, context.holidays) !== null) return 'on-holiday';
  const weekday = weekdayOf(session.date);
  if (isOutsideEffectiveHours(session, weekday, context.overrides, context.staticDayByWeekday)) {
    return 'outside-center-hours';
  }
  return teacherAvailabilityReason(session, weekday, context.availabilityByTeacher);
}

function isOutsideEffectiveHours(
  session: SessionOccurrenceView,
  weekday: WeekdayIndex,
  overrides: readonly CenterHoursOverride[],
  staticDayByWeekday: ReadonlyMap<WeekdayIndex, DayHours>,
): boolean {
  const staticDay = staticDayByWeekday.get(weekday) ?? null;
  const windows = resolveEffectiveWindows(session.date, weekday, overrides, staticDay);
  if (windows === null) return false;
  return (
    SessionConflictPolicy.withinWindows(
      { dayOfWeek: weekday, start: session.start, end: session.end },
      windows,
    ) !== null
  );
}

function teacherAvailabilityReason(
  session: SessionOccurrenceView,
  weekday: WeekdayIndex,
  availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>,
): SessionAuditReason | null {
  if (session.teacherId === null) return null;
  const teacherId = toEntityId(session.teacherId);
  const rules = availabilityByTeacher.get(teacherId);
  if (rules === undefined) return null;
  const unavailable = teacherUnavailability(
    { dayOfWeek: weekday, start: session.start, end: session.end },
    teacherId,
    rules,
    { start: session.date, end: session.date },
  );
  return unavailable !== null ? 'outside-teacher-availability' : null;
}
