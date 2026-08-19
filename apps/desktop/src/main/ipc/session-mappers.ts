import type { SessionOccurrenceView, WeeklySessionView } from '@centresoutien/domain';

// Shared session-view mappers, split out of `handlers.ts` so the teacher-
// availability handlers can reuse them (session.week / session.audit / recheck).

/** Project an enriched weekly-session view to its boundary DTO: branded
 *  `TimeOfDay`/id values widened to plain strings for the wire; the join-derived
 *  fields pass through with their neutral-fallback nulls already resolved. */
export function toWeeklySessionView(session: WeeklySessionView) {
  return {
    id: session.id,
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
    roomId: session.roomId,
    roomName: session.roomName,
    teacherId: session.teacherId,
    teacherName: session.teacherName === null ? null : { ...session.teacherName },
    groupId: session.groupId,
    subjectId: session.subjectId,
    subjectName: session.subjectName === null ? null : { ...session.subjectName },
    level: session.level,
    kind: session.kind,
  };
}

/** Project an enriched dated occurrence to its boundary DTO. */
export function toSessionOccurrenceView(view: SessionOccurrenceView) {
  return {
    id: view.id,
    recurringSessionId: view.recurringSessionId,
    date: view.date,
    start: view.start,
    end: view.end,
    roomId: view.roomId,
    roomName: view.roomName,
    teacherId: view.teacherId,
    teacherName: view.teacherName === null ? null : { ...view.teacherName },
    groupId: view.groupId,
    subjectId: view.subjectId,
    subjectName: view.subjectName === null ? null : { ...view.subjectName },
    level: view.level,
    kind: view.kind,
  };
}
