import { SessionConflictPolicy, type DayHours } from './session-conflict-policy';
import type { RoomConflictError, ScheduledSessionRef, SessionOutsideCenterHoursError } from '../errors/scheduling-errors';
import type { GroupId } from '../entities/group';
import type { RoomId } from '../entities/room';
import type { EntityId } from '../value-objects/ids';
import type { WeeklyBlock } from '../value-objects/weekly-block';

/** One generated block still awaiting conflict detection, tagged with its group. */
export type GeneratedBlockCandidate = {
  readonly groupId: GroupId;
  readonly block: WeeklyBlock;
  readonly roomId: RoomId;
};

/**
 * A conflict surfaced against a generator run's own proposals (SOU-161) —
 * always non-blocking (a "warning" in the preview, never a thrown error): the
 * admin sees it and decides whether to adjust the config or accept it as-is.
 * Kept distinct from {@link SessionConflict} (composite-session-conflicts.ts),
 * which vetoes a single already-decided candidate at the point of manual
 * creation — this type instead reports across a whole batch of proposals.
 */
export type GeneratedScheduleConflict =
  | { readonly kind: 'room'; readonly groupId: GroupId; readonly error: RoomConflictError }
  | { readonly kind: 'hours'; readonly groupId: GroupId; readonly error: SessionOutsideCenterHoursError };

/**
 * Checks every generated block for two things a generation run can silently
 * get wrong: a block that overruns the center's closing time on its weekday
 * (the engine only ever anchors a block's `start` at `open`, never validates
 * `end` against `close`), and a room double-booked at an overlapping
 * weekday+time — either against the real, already-committed schedule
 * (`existingSchedule`) or against another group's proposal generated in this
 * same run (random room assignment has no way to know about a sibling
 * proposal's pick). Reuses {@link SessionConflictPolicy.withinCenterHours} and
 * {@link SessionConflictPolicy.roomConflict} so the underlying rules never
 * diverge from manual single-session creation. Pure — no I/O, no clock.
 */
export function detectGeneratedScheduleConflicts(
  candidates: readonly GeneratedBlockCandidate[],
  existingSchedule: readonly ScheduledSessionRef[],
  centerHours: readonly DayHours[],
): readonly GeneratedScheduleConflict[] {
  const conflicts: GeneratedScheduleConflict[] = [];

  candidates.forEach((candidate, index) => {
    const hours = SessionConflictPolicy.withinCenterHours(candidate.block, centerHours);
    if (hours) conflicts.push({ kind: 'hours', groupId: candidate.groupId, error: hours });

    const siblings = candidates.filter((_, other) => other !== index).map(toScheduledSessionRef);
    const room = SessionConflictPolicy.roomConflict(
      { ...candidate.block, roomId: candidate.roomId },
      [...existingSchedule, ...siblings],
    );
    if (room) conflicts.push({ kind: 'room', groupId: candidate.groupId, error: room });
  });

  return conflicts;
}

function toScheduledSessionRef(candidate: GeneratedBlockCandidate): ScheduledSessionRef {
  return {
    // These sibling proposals aren't persisted sessions yet, so there is no
    // real session id to carry — the group id says which proposal a reported
    // conflict points back to. EntityId is the deliberately generic id bucket
    // (see entities/group.ts `teacherId: EntityId | null`), so this widening
    // is the same kind of cast already used elsewhere in the domain.
    id: candidate.groupId as unknown as EntityId,
    roomId: candidate.roomId,
    dayOfWeek: candidate.block.dayOfWeek,
    start: candidate.block.start,
    end: candidate.block.end,
  };
}
