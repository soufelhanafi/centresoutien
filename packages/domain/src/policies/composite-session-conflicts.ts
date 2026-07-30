import {
  SessionConflictPolicy,
  type DayHours,
  type RoomSessionCandidate,
} from './session-conflict-policy';
import type {
  MalformedSessionTimeError,
  RoomConflictError,
  ScheduledSessionRef,
  SessionOutsideCenterHoursError,
  TeacherConflictError,
} from '../errors/scheduling-errors';
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
  | { kind: 'hours'; severity: 'error'; error: SessionOutsideCenterHoursError }
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
};

/**
 * Composite scheduling check (SOU-55): gather room + teacher + opening-hours
 * conflicts for one candidate in a single pass and return them as a typed list,
 * most-blocking first. A malformed time range short-circuits — the overlap and
 * hours checks assume a positive-duration interval. An empty list means the slot
 * is free. Pure: no I/O, no clock; the caller supplies the scoped week and refs.
 */
export function detectSessionConflicts(
  candidate: CompositeSessionCandidate,
  context: ConflictCheckContext,
): readonly SessionConflict[] {
  const malformed = SessionConflictPolicy.wellFormed(candidate);
  if (malformed) return [{ kind: 'malformed', severity: 'error', error: malformed }];

  const conflicts: SessionConflict[] = [];

  const hours = SessionConflictPolicy.withinCenterHours(candidate, context.week);
  if (hours) conflicts.push({ kind: 'hours', severity: 'error', error: hours });

  const room = SessionConflictPolicy.roomConflict(candidate, context.existing);
  if (room) conflicts.push({ kind: 'room', severity: 'error', error: room });

  if (candidate.teacherId !== undefined) {
    const teacher = SessionConflictPolicy.teacherConflict(
      { ...candidate, teacherId: candidate.teacherId },
      context.existing,
    );
    if (teacher) conflicts.push({ kind: 'teacher', severity: 'error', error: teacher });
  }

  return conflicts;
}
