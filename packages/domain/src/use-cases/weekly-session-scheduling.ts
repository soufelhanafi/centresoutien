import {
  detectSessionConflicts,
  type CompositeSessionCandidate,
} from '../policies/composite-session-conflicts';
import type { DayHours } from '../policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { RoomId } from '../entities/room';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';

export { resolveWeek } from '../schemas/center-hours';

/**
 * The domain fields a candidate slot commits (SOU-131). `teacherId` is nullable —
 * a null teacher never participates in the teacher-overlap check.
 */
export type ScheduleCandidateFields = {
  roomId: RoomId;
  teacherId: EntityId | null;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/**
 * Project the candidate to the composite policy shape, omitting `teacherId`
 * entirely when null (under `exactOptionalPropertyTypes` the optional property
 * must be absent, not `undefined`).
 */
export function toCompositeCandidate(fields: ScheduleCandidateFields): CompositeSessionCandidate {
  const base = {
    roomId: fields.roomId,
    dayOfWeek: fields.dayOfWeek,
    start: fields.start,
    end: fields.end,
  };
  return fields.teacherId === null ? base : { ...base, teacherId: fields.teacherId };
}

/**
 * Run the SOU-55 composite check (malformed → hours → room → teacher) and throw
 * the most-blocking conflict when the slot clashes; a free slot returns. The
 * caller pre-scopes `existing` (same center, that weekday, alive) and — on edit —
 * excludes the row being edited so a slot never clashes with itself.
 *
 * When `overrideWindows` is supplied (SOU-165: an active center-hours override
 * covers the slot's concrete date), those windows replace the static `week` for
 * the hours check and an out-of-window slot throws
 * {@link SessionOutsideOverrideHoursError} (`code:'outside-windows'`) instead of
 * the static outside-hours error. Absent → the static hours check runs unchanged.
 */
export function assertScheduleFree(
  fields: ScheduleCandidateFields,
  existing: readonly ScheduledSessionRef[],
  week: readonly DayHours[],
  overrideWindows?: readonly TimeWindow[],
): void {
  const context =
    overrideWindows !== undefined
      ? { existing, week, overrideWindows }
      : { existing, week };
  const conflicts = detectSessionConflicts(toCompositeCandidate(fields), context);
  const first = conflicts[0];
  if (first) throw first.error;
}
