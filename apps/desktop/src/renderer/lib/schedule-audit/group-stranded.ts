import { weekdayOf } from '@centresoutien/domain';
import type { SessionAuditReason, StrandedSessionView } from './stranded-session-view';

/**
 * One structural audit problem (SOU-262, SOU-296): every stranded occurrence
 * that shares one conflict type, one weekday, and one primary resource (teacher
 * or room), in ascending date order. A group of one is a genuinely dated case
 * (e.g. only the week a holiday shifted) and the list renders it as a plain row;
 * a larger group is the "same collision every week" case collapsed to one card
 * with a ×N badge.
 */
export type StrandedGroup = {
  readonly key: string;
  readonly reason: SessionAuditReason;
  readonly occurrences: readonly StrandedSessionView[];
};

/**
 * The resource a conflict attaches to (SOU-296): the teacher for teacher-scoped
 * reasons, the room for room-scoped reasons, empty for center-wide reasons
 * (hours / holiday) that aren't tied to one resource. Two teachers unavailable on
 * the same weekday stay distinct; the center closing a weekday collapses every
 * affected session, since they share one root cause.
 */
function primaryResourceKey(reason: SessionAuditReason, session: StrandedSessionView['session']): string {
  switch (reason) {
    case 'teacher-unavailable':
    case 'teacher-double-booked':
      return `teacher:${session.teacherId ?? 'none'}`;
    case 'room-double-booked':
    case 'room-archived':
    case 'room-over-capacity':
      return `room:${session.roomId}`;
    case 'outside-center-hours':
    case 'holiday/blackout':
      return '';
  }
}

/**
 * Collapses the audit's per-date rows into structural problems, keyed by
 * `conflict-type + weekday + primary resource` (SOU-296) — not the template
 * identity, so two templates that double-book the same room/teacher on the same
 * weekday merge into one root-cause card, while two teachers unavailable the
 * same weekday stay two honestly-badged groups. The ×N count is the number of
 * occurrences actually stranded, so weeks a holiday already clears are never
 * counted. Groups order by their earliest date (then key), occurrences by date —
 * both deterministic for a stable list across refetches.
 */
export function groupStrandedSessions(
  stranded: readonly StrandedSessionView[],
): readonly StrandedGroup[] {
  const byKey = new Map<string, StrandedSessionView[]>();
  for (const item of stranded) {
    const key = `${item.reason}|${weekdayOf(item.session.date)}|${primaryResourceKey(item.reason, item.session)}`;
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, [item]);
    else bucket.push(item);
  }

  const groups = [...byKey.entries()].map(([key, occurrences]) => ({
    key,
    reason: occurrences[0]!.reason,
    occurrences: [...occurrences].sort((a, b) => a.session.date.localeCompare(b.session.date)),
  }));
  return groups.sort((a, b) => {
    const firstA = a.occurrences[0]!.session.date;
    const firstB = b.occurrences[0]!.session.date;
    return firstA !== firstB ? firstA.localeCompare(firstB) : a.key.localeCompare(b.key);
  });
}
