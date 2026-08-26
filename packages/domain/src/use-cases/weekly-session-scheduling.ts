import {
  detectSessionConflicts,
  type CompositeSessionCandidate,
  type ConflictCheckContext,
  type TeacherAvailabilityConflictContext,
  type StudentConflictContext,
} from '../policies/composite-session-conflicts';
import type { DayHours } from '../policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { GroupRepository } from '../ports/group-repository';
import type { RoomRepository } from '../ports/room-repository';
import type { RoomId } from '../entities/room';
import type { GroupId } from '../entities/group';
import type { CenterCode, EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { WeeklyRecurringSessionInput } from '../schemas/weekly-recurring-session';
import { assertGroupFitsRoom } from '../policies/group-seat-capacity';
import { GroupNotFoundError } from '../errors/group-errors';
import { RoomNotFoundError } from '../errors/room-errors';

export { resolveWeek } from '../schemas/center-hours';

/**
 * The domain fields a candidate slot commits (SOU-131). `teacherId` is nullable —
 * a null teacher never participates in the teacher-overlap check. `validFrom` /
 * `validTo` ride along (SOU-287) so the shared schedule validator can intersect
 * the recurrence's validity window with the scheduling horizon before checking
 * one-off absences — they are not part of the composite conflict candidate.
 */
export type ScheduleCandidateFields = {
  roomId: RoomId;
  teacherId: EntityId | null;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
  validFrom: string | null;
  validTo: string | null;
};

/**
 * A validated slot with its branded ids, shared by the create and edit paths so
 * the (identical) casts off the parsed input live in one place. `groupId` is kept
 * alongside the schedule candidate for the seat-fit binding check.
 */
export type ParsedSlotFields = ScheduleCandidateFields & {
  groupId: GroupId | null;
};

/** Brand the shape-validated input fields to their domain id types. */
export function brandSlotFields(fields: WeeklyRecurringSessionInput): ParsedSlotFields {
  return {
    roomId: fields.roomId as RoomId,
    teacherId: fields.teacherId as EntityId | null,
    groupId: fields.groupId as GroupId | null,
    dayOfWeek: fields.dayOfWeek as WeekdayIndex,
    start: fields.start as TimeOfDay,
    end: fields.end as TimeOfDay,
    validFrom: fields.validFrom,
    validTo: fields.validTo,
  };
}

/** Project a parsed slot to the schedule-conflict candidate, dropping `groupId`. */
export function toScheduleCandidate(slot: ParsedSlotFields): ScheduleCandidateFields {
  return {
    roomId: slot.roomId,
    teacherId: slot.teacherId,
    dayOfWeek: slot.dayOfWeek,
    start: slot.start,
    end: slot.end,
    validFrom: slot.validFrom,
    validTo: slot.validTo,
  };
}

/**
 * The SOU-176 seat-fit gate shared by create and edit: when the slot binds a
 * group, the group and room must resolve to live rows of the same center
 * ({@link GroupNotFoundError} / {@link RoomNotFoundError}) and the group's capacity
 * must fit the room ({@link assertGroupFitsRoom}). A slot with no group binds no
 * room requirement and passes. Never skipped by the force path.
 */
export async function assertGroupBindingFitsRoom(
  repos: { readonly groups: GroupRepository; readonly rooms: RoomRepository },
  centerCode: CenterCode,
  groupId: GroupId | null,
  roomId: RoomId,
): Promise<void> {
  if (groupId === null) return;
  const group = await repos.groups.findById(groupId);
  if (group === null || group.centerCode !== centerCode) {
    throw new GroupNotFoundError(groupId);
  }
  const room = await repos.rooms.findById(roomId);
  if (room === null || room.centerCode !== centerCode) {
    throw new RoomNotFoundError(roomId);
  }
  assertGroupFitsRoom(group.id, group.capacity, room);
}

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
 * Run the SOU-55 composite check (malformed → hours → room → teacher →
 * teacher-availability → student) and throw the most-blocking conflict when the
 * slot clashes; a free slot returns. The caller pre-scopes `existing` (same
 * center, that weekday, alive) and — on edit — excludes the row being edited so
 * a slot never clashes with itself.
 *
 * When `overrideWindows` is supplied (SOU-165: an active center-hours override
 * covers the slot's concrete date), those windows replace the static `week` for
 * the hours check and an out-of-window slot throws
 * {@link SessionOutsideOverrideHoursError} (`code:'outside-windows'`) instead of
 * the static outside-hours error. Absent → the static hours check runs unchanged.
 *
 * When `availability` is supplied (SOU-283: the plan holds
 * `planning.teacher-availability` and the candidate's teacher has a configured
 * row or a covering absence), an out-of-window placement is gathered as a
 * `warning`-severity conflict. Because warnings sort after every hard error, a
 * co-occurring room/teacher/hours clash is thrown first (an error stays blocking)
 * and the availability warning is thrown only when it is the sole conflict — at
 * which point the caller's `allowScheduleConflict` force path can commit past it.
 * A teacher with no configured row is never passed here, so unconfigured teachers
 * stay unrestricted.
 *
 * When `studentConflict` is supplied (the slot binds a group with a live
 * roster), a student on that roster also attending another group whose session
 * overlaps this one is gathered the same `warning`-severity way — forceable,
 * never a hard block.
 */
export function assertScheduleFree(
  fields: ScheduleCandidateFields,
  existing: readonly ScheduledSessionRef[],
  week: readonly DayHours[],
  overrideWindows?: readonly TimeWindow[],
  availability?: TeacherAvailabilityConflictContext,
  studentConflict?: StudentConflictContext,
): void {
  const context: ConflictCheckContext = {
    existing,
    week,
    ...(overrideWindows !== undefined ? { overrideWindows } : {}),
    ...(availability !== undefined ? { teacherAvailability: availability } : {}),
    ...(studentConflict !== undefined ? { studentConflict } : {}),
  };
  const conflicts = detectSessionConflicts(toCompositeCandidate(fields), context);
  const first = conflicts[0];
  if (first) throw first.error;
}
