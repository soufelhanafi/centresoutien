import { toEntityId, type EntityId } from '../value-objects/ids';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { HolidayOccurrence } from './holiday-policy';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import type { DayHours } from './session-conflict-policy';
import type { TeacherAvailabilityRules } from './teacher-availability-policy';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { GroupId } from '../entities/group';
import { SessionConflictPolicy, strictlyOverlaps } from './session-conflict-policy';
import { resolveEffectiveWindows } from './center-hours-override-policy';
import { holidayOn } from './holiday-policy';
import { teacherUnavailability } from './teacher-availability-policy';
import { weekdayOf } from '../value-objects/date-range';

/**
 * Why a materialized session is stranded — the full conflict taxonomy the
 * standing audit (SOU-296) consumes. One reason per failure mode, each with its
 * own code; a single occurrence can carry several at once (double-booked *and*
 * over-capacity, say), so there is no precedence here — the caller gathers every
 * one that applies. Mapping to the issue's names:
 * `teacher-unavailable` → `outside-teacher-availability`,
 * `holiday/blackout` → `on-holiday`. The three original codes are kept verbatim
 * so existing callers/badges migrate with a rename, not a re-map.
 */
export type SessionAuditReason =
  | 'outside-center-hours'
  | 'on-holiday'
  | 'outside-teacher-availability'
  | 'teacher-double-booked'
  | 'room-double-booked'
  | 'room-archived'
  | 'room-over-capacity';

/** One occurrence the audit flags, with every reason it is now stranded. */
export type StrandedSession = {
  readonly session: SessionOccurrenceView;
  readonly reasons: readonly SessionAuditReason[];
};

/** The live-config lenses each occurrence is audited against (SOU-296). */
export type SessionAuditContext = {
  readonly holidays: readonly HolidayOccurrence[];
  readonly overrides: readonly CenterHoursOverride[];
  readonly staticDayByWeekday: ReadonlyMap<WeekdayIndex, DayHours>;
  readonly availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
  /** Every live occurrence (today-forward), for the date-aware double-book checks. */
  readonly liveSchedule: readonly SessionOccurrenceView[];
  /** Live enrollment count per group — the room-over-capacity numerator. */
  readonly enrollmentByGroup: ReadonlyMap<GroupId, number>;
};

/**
 * Classify one occurrence against the current live state, returning every reason
 * that now applies (empty = still fits). No precedence — all seven checks run.
 * Reuses the same primitives interactive scheduling trusts (never a parallel
 * reimplementation): {@link holidayOn}, the shared window-fit rule via
 * {@link resolveEffectiveWindows} + {@link SessionConflictPolicy.withinWindows},
 * {@link teacherUnavailability}, {@link strictlyOverlaps} for the two double-book
 * checks, and the same `>=` seat-fit rule `capacityOverflow` enforces.
 */
export function auditReasonsFor(
  session: SessionOccurrenceView,
  context: SessionAuditContext,
): readonly SessionAuditReason[] {
  const reasons: SessionAuditReason[] = [];
  if (holidayOn(session.date, context.holidays) !== null) reasons.push('on-holiday');

  const weekday = weekdayOf(session.date);
  if (isOutsideEffectiveHours(session, weekday, context.overrides, context.staticDayByWeekday)) {
    reasons.push('outside-center-hours');
  }

  if (teacherUnavailable(session, weekday, context.availabilityByTeacher)) {
    reasons.push('outside-teacher-availability');
  }

  if (session.roomArchived) reasons.push('room-archived');
  if (isOverCapacity(session, context.enrollmentByGroup)) reasons.push('room-over-capacity');
  if (isRoomDoubleBooked(session, context.liveSchedule)) reasons.push('room-double-booked');
  if (session.teacherId !== null && isTeacherDoubleBooked(session, context.liveSchedule)) {
    reasons.push('teacher-double-booked');
  }
  return reasons;
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

function teacherUnavailable(
  session: SessionOccurrenceView,
  weekday: WeekdayIndex,
  availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>,
): boolean {
  if (session.teacherId === null) return false;
  const teacherId = toEntityId(session.teacherId);
  const rules = availabilityByTeacher.get(teacherId);
  if (rules === undefined) return false;
  return (
    teacherUnavailability(
      { dayOfWeek: weekday, start: session.start, end: session.end },
      teacherId,
      rules,
      { start: session.date, end: session.date },
    ) !== null
  );
}

/** Soft warning (SOU-189 force mirror): the live room seats fewer than the
 *  group's current active enrollment. Archived rooms and unknown capacities are
 *  skipped — the former is already `room-archived`, the latter unverifiable. */
function isOverCapacity(
  session: SessionOccurrenceView,
  enrollmentByGroup: ReadonlyMap<GroupId, number>,
): boolean {
  if (session.roomArchived || session.roomCapacity === null || session.groupId === null) return false;
  const enrolled = enrollmentByGroup.get(session.groupId) ?? 0;
  return enrolled > session.roomCapacity;
}

/** Date-aware room double-book: another live occurrence on the same civil date,
 *  same room, overlapping time. `roomConflict`/`teacherConflict` are keyed by
 *  `dayOfWeek` (weekly templates) and would collide two different dates of the
 *  same weekday, so the audit compares concrete `date`s and reuses only the shared
 *  {@link strictlyOverlaps} overlap rule. */
function isRoomDoubleBooked(
  session: SessionOccurrenceView,
  liveSchedule: readonly SessionOccurrenceView[],
): boolean {
  return liveSchedule.some(
    (other) =>
      other.id !== session.id &&
      other.date === session.date &&
      other.roomId === session.roomId &&
      strictlyOverlaps(session, other),
  );
}

/** Date-aware teacher double-book: same civil date, same teacher, overlapping
 *  time. See {@link isRoomDoubleBooked} for why the date filter is required. */
function isTeacherDoubleBooked(
  session: SessionOccurrenceView,
  liveSchedule: readonly SessionOccurrenceView[],
): boolean {
  return liveSchedule.some(
    (other) =>
      other.id !== session.id &&
      other.teacherId !== null &&
      other.teacherId === session.teacherId &&
      other.date === session.date &&
      strictlyOverlaps(session, other),
  );
}
