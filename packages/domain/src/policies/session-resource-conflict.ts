import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { GroupId } from '../entities/group';
import { strictlyOverlaps } from './session-conflict-policy';

/**
 * The room/teacher resource-conflict checks the standing audit (SOU-296) runs
 * against the LIVE committed schedule. Split out of `session-audit-reason` so
 * the taxonomy file stays under the size ceiling. All three reuse the same
 * overlap / seat-fit primitives interactive scheduling trusts — never a parallel
 * reimplementation.
 */

/** Soft warning (SOU-189 force mirror): the live room seats fewer than the
 *  group's current active enrollment. Archived rooms and unknown capacities are
 *  skipped — the former is already `room-archived`, the latter unverifiable. */
export function isOverCapacity(
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
export function isRoomDoubleBooked(
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
export function isTeacherDoubleBooked(
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
