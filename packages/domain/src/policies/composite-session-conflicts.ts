import {
  SessionConflictPolicy,
  type DayHours,
  type RoomSessionCandidate,
} from './session-conflict-policy';
import {
  SessionOutsideOverrideHoursError,
  type MalformedSessionTimeError,
  type RoomConflictError,
  type ScheduledSessionRef,
  type SessionOutsideCenterHoursError,
  type TeacherConflictError,
} from '../errors/scheduling-errors';
import type { TimeWindow } from '../value-objects/time-window';
import type { EntityId } from '../value-objects/ids';

/**
 * How much a conflict blocks scheduling. Everything today is a hard `error`;
 * `warning` is the seam holidays slot into later (SOU-30) — a session on a
 * holiday is discouraged, not forbidden — without reshaping this contract.
 */
export type ConflictSeverity = 'error' | 'warning';

/**
 * One detected conflict, discriminated by `kind` and carrying the concrete
 * domain error so the renderer localizes it and lists the clashing refs. The
 * error is never thrown here — composite detection gathers, the scheduling use
 * case decides what to do with a non-empty list.
 */
export type SessionConflict =
  | { kind: 'malformed'; severity: 'error'; error: MalformedSessionTimeError }
  | {
      kind: 'hours';
      severity: 'error';
      error: SessionOutsideCenterHoursError | SessionOutsideOverrideHoursError;
    }
  | { kind: 'room'; severity: 'error'; error: RoomConflictError }
  | { kind: 'teacher'; severity: 'error'; error: TeacherConflictError };

/** A candidate booking a room and, optionally, a teacher. */
export type CompositeSessionCandidate = RoomSessionCandidate & {
  teacherId?: EntityId;
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
