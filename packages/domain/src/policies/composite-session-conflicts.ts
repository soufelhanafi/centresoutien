import {
  SessionConflictPolicy,
  type DayHours,
  type RoomSessionCandidate,
} from './session-conflict-policy';
import { teacherUnavailability, type TeacherAvailabilityRules } from './teacher-availability-policy';
import { studentDoubleBookingsForCandidate, type StudentScheduleIndex } from './student-schedule-conflict';
import {
  SessionOutsideOverrideHoursError,
  type MalformedSessionTimeError,
  type RoomConflictError,
  type ScheduledSessionRef,
  type SessionOutsideCenterHoursError,
  type TeacherConflictError,
} from '../errors/scheduling-errors';
import type { TeacherUnavailableError } from '../errors/teacher-availability-errors';
import { StudentDoubleBookedError } from '../errors/student-conflict-errors';
import type { GroupId } from '../entities/group';
import type { StudentId } from '../entities/student';
import type { TimeWindow } from '../value-objects/time-window';
import type { DateRange } from '../value-objects/date-range';
import type { EntityId } from '../value-objects/ids';

/**
 * How much a conflict blocks scheduling. A hard `error` (room/teacher double-book,
 * outside opening hours) is the veto the scheduling use case throws by default; a
 * `warning` (SOU-283: an out-of-window teacher-availability placement) is a soft
 * signal the admin can force past with an acknowledgement flag, mirroring the
 * SOU-189/SOU-183 double-book `allowScheduleConflict`. Ordering keeps every error
 * ahead of every warning so `assertScheduleFree` throws the most-blocking one.
 */
export type ConflictSeverity = 'error' | 'warning';

/**
 * One detected conflict, discriminated by `kind` and carrying the concrete
 * domain error so the renderer localizes it and lists the clashing refs. The
 * error is never thrown here — composite detection gathers, the scheduling use
 * case decides what to do with a non-empty list.
 *
 * `teacher-availability` (SOU-283) and `student` are the two `warning` kinds: an
 * out-of-window placement against a teacher's declared availability, or a
 * student enrolled in the candidate's group also attending another group whose
 * session overlaps this one. Both are gathered last so a co-occurring hard
 * error still wins the most-blocking slot.
 */
export type SessionConflict =
  | { kind: 'malformed'; severity: 'error'; error: MalformedSessionTimeError }
  | {
      kind: 'hours';
      severity: 'error';
      error: SessionOutsideCenterHoursError | SessionOutsideOverrideHoursError;
    }
  | { kind: 'room'; severity: 'error'; error: RoomConflictError }
  | { kind: 'teacher'; severity: 'error'; error: TeacherConflictError }
  | { kind: 'teacher-availability'; severity: 'warning'; error: TeacherUnavailableError }
  | { kind: 'student'; severity: 'warning'; error: StudentDoubleBookedError };

/** A candidate booking a room and, optionally, a teacher. */
export type CompositeSessionCandidate = RoomSessionCandidate & {
  teacherId?: EntityId;
};

/**
 * The teacher-availability inputs the composite check reads for the candidate's
 * teacher when the SOU-259 feature is active (SOU-283). `rules` is that one
 * teacher's declared weekly windows + one-off absences — a row that EXISTS but
 * has all weekdays empty means whole-week-off (`weeklyWindows` non-null, every
 * list empty) so every placement reads out-of-window, whereas a teacher with NO
 * configured row is simply absent from the context and never checked (the caller
 * passes `undefined`, preserving "absence of a row = unrestricted").
 * `materializationRange` is the candidate's concrete occurrence date as an
 * inclusive single-day range for the exception check (`null` skips exceptions).
 */
export type TeacherAvailabilityConflictContext = {
  readonly rules: TeacherAvailabilityRules;
  readonly materializationRange: DateRange | null;
};

/**
 * The student-conflict inputs the composite check reads for the candidate's own
 * group. `roster` is that group's current live enrollment; `studentIndex` is
 * every OTHER group any of those students attends, pre-built by the caller so
 * this check never needs to re-derive it — critically, the caller excludes the
 * candidate's own `groupId` when building it, so this group's own other weekly
 * slots never self-match. Absent means the slot binds no group (or the plan
 * caller chose not to check), so the warning is skipped entirely.
 */
export type StudentConflictContext = {
  readonly groupId: GroupId;
  readonly roster: readonly StudentId[];
  readonly studentIndex: StudentScheduleIndex;
};

/**
 * The already-loaded state the checks read. `existing` MUST be pre-scoped by the
 * caller to same-center, non-soft-deleted (`deletedAt === null`) active refs:
 * {@link ScheduledSessionRef} is deliberately tenant-blind (no `centerCode`), so
 * a cross-center leak can only happen if a ref from another center is passed in
 * here. Scoping is the use case's job, not the policy's (SOU-35 review, Minor #2).
 */
export type ConflictCheckContext = {
  existing: readonly ScheduledSessionRef[];
  week: readonly DayHours[];
  /**
   * The effective opening windows for the candidate's concrete date when an
   * active center-hours override covers it (SOU-165). When present, they
   * **replace** the static `week` for the hours check: the candidate must fit
   * entirely inside one window, and a miss is reported as a
   * {@link SessionOutsideOverrideHoursError} (transported `code:'outside-windows'`)
   * so the renderer shows the override-specific line. Absent → the static
   * {@link SessionConflictPolicy.withinCenterHours} check runs unchanged.
   */
  overrideWindows?: readonly TimeWindow[];
  /**
   * The candidate teacher's availability inputs (SOU-283). Present only when the
   * plan holds `planning.teacher-availability` **and** the teacher has a
   * configured row (or a covering exception); its absence means the teacher is
   * unrestricted, so the availability check is skipped. When present, a placement
   * outside the teacher's windows or on an absence date is gathered as a
   * `warning`-severity `teacher-availability` conflict.
   */
  teacherAvailability?: TeacherAvailabilityConflictContext;
  studentConflict?: StudentConflictContext;
};

/**
 * Composite scheduling check (SOU-55): gather room + teacher + opening-hours
 * conflicts for one candidate in a single pass and return them as a typed list,
 * most-blocking first. A malformed time range short-circuits — the overlap and
 * hours checks assume a positive-duration interval. An empty list means the slot
 * is free. Pure: no I/O, no clock; the caller supplies the scoped week and refs.
 *
 * On a date an active override covers (SOU-165), the caller passes
 * `overrideWindows`; those windows replace the static `week` for the hours check
 * and a miss surfaces as an {@link SessionOutsideOverrideHoursError} instead of
 * the static {@link SessionOutsideCenterHoursError}.
 */
export function detectSessionConflicts(
  candidate: CompositeSessionCandidate,
  context: ConflictCheckContext,
): readonly SessionConflict[] {
  const malformed = SessionConflictPolicy.wellFormed(candidate);
  if (malformed) return [{ kind: 'malformed', severity: 'error', error: malformed }];

  const conflicts: SessionConflict[] = [];

  const hours = detectHoursConflict(candidate, context);
  if (hours) conflicts.push({ kind: 'hours', severity: 'error', error: hours });

  const room = SessionConflictPolicy.roomConflict(candidate, context.existing);
  if (room) conflicts.push({ kind: 'room', severity: 'error', error: room });

  const { teacherId } = candidate;
  if (teacherId !== undefined) {
    const teacher = SessionConflictPolicy.teacherConflict({ ...candidate, teacherId }, context.existing);
    if (teacher) conflicts.push({ kind: 'teacher', severity: 'error', error: teacher });

    const availability = context.teacherAvailability;
    if (availability !== undefined) {
      const unavailable = teacherUnavailability(
        candidate,
        teacherId,
        availability.rules,
        availability.materializationRange,
      );
      if (unavailable) {
        conflicts.push({ kind: 'teacher-availability', severity: 'warning', error: unavailable });
      }
    }
  }

  const studentConflict = context.studentConflict;
  if (studentConflict !== undefined) {
    const clashes = studentDoubleBookingsForCandidate(
      {
        groupId: studentConflict.groupId,
        dayOfWeek: candidate.dayOfWeek,
        start: candidate.start,
        end: candidate.end,
      },
      studentConflict.roster,
      studentConflict.studentIndex,
    );
    if (clashes.length > 0) {
      conflicts.push({ kind: 'student', severity: 'warning', error: new StudentDoubleBookedError(clashes) });
    }
  }

  return conflicts;
}

/**
 * The hours conflict for a candidate: against its date's active-override windows
 * when the caller supplied them (raising the override-specific error), otherwise
 * against the static week.
 */
function detectHoursConflict(
  candidate: CompositeSessionCandidate,
  context: ConflictCheckContext,
): SessionOutsideCenterHoursError | SessionOutsideOverrideHoursError | null {
  if (context.overrideWindows === undefined) {
    return SessionConflictPolicy.withinCenterHours(candidate, context.week);
  }
  const violation = SessionConflictPolicy.withinWindows(candidate, context.overrideWindows);
  if (violation === null) return null;
  return new SessionOutsideOverrideHoursError(
    candidate.dayOfWeek,
    violation.reason,
    context.overrideWindows,
  );
}
