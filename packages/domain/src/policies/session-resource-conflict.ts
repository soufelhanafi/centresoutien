import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { GroupId } from '../entities/group';
import { strictlyOverlaps } from './session-conflict-policy';

/**
 * The room/teacher resource-conflict checks the standing audit (SOU-296) runs
 * against the LIVE committed schedule. Split out of `session-audit-reason` so
 * the taxonomy file stays under the size ceiling. All three reuse the same
 * overlap / seat-fit primitives interactive scheduling trusts — never a parallel
 * reimplementation.
 *
 * The double-book checks are driven by a pre-built index ({@link buildResourceScheduleIndex})
 * instead of a linear scan, so an N-occurrence audit stays O(N) rather than O(N²):
 * each session only inspects the handful of occurrences sharing its exact
 * `(date, resource)` bucket, never the whole schedule.
 */

/** Sessions keyed by `date\u0000resourceId`, for the two double-book lookups. */
export type ResourceScheduleIndex = {
  readonly byDateRoom: ReadonlyMap<string, readonly SessionOccurrenceView[]>;
  readonly byDateTeacher: ReadonlyMap<string, readonly SessionOccurrenceView[]>;
};

const roomKeyOf = (session: SessionOccurrenceView): string =>
  `${session.date}\u0000${session.roomId}`;
const teacherKeyOf = (session: SessionOccurrenceView): string =>
  `${session.date}\u0000${session.teacherId ?? ''}`;

/**
 * Indexes the live schedule once so double-book detection is O(1) per lookup
 * (per `(date, room)` and `(date, teacher)`), rather than a per-occurrence scan
 * of the entire schedule.
 */
export function buildResourceScheduleIndex(
  liveSchedule: readonly SessionOccurrenceView[],
): ResourceScheduleIndex {
  const byDateRoom = new Map<string, SessionOccurrenceView[]>();
  const byDateTeacher = new Map<string, SessionOccurrenceView[]>();
  for (const session of liveSchedule) {
    const roomBucket = byDateRoom.get(roomKeyOf(session));
    if (roomBucket === undefined) byDateRoom.set(roomKeyOf(session), [session]);
    else roomBucket.push(session);

    if (session.teacherId !== null) {
      const teacherKey = teacherKeyOf(session);
      const teacherBucket = byDateTeacher.get(teacherKey);
      if (teacherBucket === undefined) byDateTeacher.set(teacherKey, [session]);
      else teacherBucket.push(session);
    }
  }
  return { byDateRoom, byDateTeacher };
}

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
 *  same room, overlapping time. Looked up via the `(date, room)` index — the
 *  day-of-week `roomConflict` would collide two different dates of the same
 *  weekday, so the audit compares concrete `date`s and reuses only the shared
 *  {@link strictlyOverlaps} overlap rule. */
export function isRoomDoubleBooked(
  session: SessionOccurrenceView,
  byDateRoom: ReadonlyMap<string, readonly SessionOccurrenceView[]>,
): boolean {
  const bucket = byDateRoom.get(roomKeyOf(session)) ?? [];
  return bucket.some((other) => other.id !== session.id && strictlyOverlaps(session, other));
}

/** Date-aware teacher double-book: same civil date, same teacher, overlapping
 *  time, via the `(date, teacher)` index. See {@link isRoomDoubleBooked} for why
 *  the date filter is required. */
export function isTeacherDoubleBooked(
  session: SessionOccurrenceView,
  byDateTeacher: ReadonlyMap<string, readonly SessionOccurrenceView[]>,
): boolean {
  if (session.teacherId === null) return false;
  const bucket = byDateTeacher.get(teacherKeyOf(session)) ?? [];
  return bucket.some((other) => other.id !== session.id && strictlyOverlaps(session, other));
}
