import { toEntityId, type EntityId } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';
import { weekdayOf } from '../value-objects/date-range';
import type { SessionAuditReason, StrandedSession } from './session-audit-reason';

/** Which resource a finding is anchored to — drives the dedup key and the label. */
export type StrandedResourceKind = 'room' | 'teacher' | 'group' | 'center';

/**
 * One structural audit problem (SOU-262, re-keyed SOU-296): every stranded
 * occurrence sharing `(reason, weekday, primary resource)` — the collision
 * identity, NOT the recurring template or time slot, so eight templates double-
 * booking Salle A on Tuesday collapse to one card, and two teachers unavailable
 * on Tuesday stay two distinct cards. `count` is the number of occurrences
 * actually stranded in this bucket; `resourceId` names the teacher/room (null for
 * center-wide findings like a holiday). A multi-reason occurrence contributes to
 * one bucket per reason, so `occurrences` are not a partition — flattening across
 * groups must dedupe by `session.id`.
 */
export type StrandedSessionGroup = {
  readonly key: string;
  readonly reason: SessionAuditReason;
  readonly weekday: WeekdayIndex;
  readonly resourceKind: StrandedResourceKind;
  readonly resourceId: EntityId | null;
  readonly count: number;
  readonly occurrences: readonly StrandedSession[];
};

/**
 * Collapse per-occurrence audit findings into structural problems keyed by
 * `(reason, weekday, resource)`. A one-off (a single date a holiday/override
 * shifted) naturally lands in a group of one — the renderer keeps its real date
 * from the occurrence, never a weekday heuristic. Groups order by earliest
 * occurrence date (then key); occurrences order by date — both deterministic.
 */
export function groupStrandedSessions(
  stranded: readonly StrandedSession[],
): readonly StrandedSessionGroup[] {
  const buckets = new Map<
    string,
    { reason: SessionAuditReason; weekday: WeekdayIndex; resourceKind: StrandedResourceKind; resourceId: EntityId | null; occurrences: StrandedSession[] }
  >();

  for (const item of stranded) {
    const weekday = weekdayOf(item.session.date);
    for (const reason of item.reasons) {
      const resource = primaryResource(reason, item);
      const key = `${reason}|${weekday}|${resource.kind}|${resource.id ?? ''}`;
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        buckets.set(key, { reason, weekday, resourceKind: resource.kind, resourceId: resource.id, occurrences: [item] });
      } else {
        bucket.occurrences.push(item);
      }
    }
  }

  const groups = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    reason: bucket.reason,
    weekday: bucket.weekday,
    resourceKind: bucket.resourceKind,
    resourceId: bucket.resourceId,
    count: bucket.occurrences.length,
    occurrences: [...bucket.occurrences].sort((a, b) => a.session.date.localeCompare(b.session.date)),
  }));

  return groups.sort((a, b) => {
    const firstA = a.occurrences[0]!.session.date;
    const firstB = b.occurrences[0]!.session.date;
    return firstA !== firstB ? firstA.localeCompare(firstB) : a.key.localeCompare(b.key);
  });
}

/** The primary resource a finding is anchored to, per reason. */
function primaryResource(
  reason: SessionAuditReason,
  item: StrandedSession,
): { readonly kind: StrandedResourceKind; readonly id: EntityId | null } {
  switch (reason) {
    case 'room-double-booked':
    case 'room-archived':
    case 'room-over-capacity':
      return { kind: 'room', id: toEntityId(item.session.roomId) };
    case 'teacher-double-booked':
    case 'outside-teacher-availability':
      return { kind: 'teacher', id: item.session.teacherId === null ? null : toEntityId(item.session.teacherId) };
    case 'student-double-booked':
      return { kind: 'group', id: item.session.groupId === null ? null : toEntityId(item.session.groupId) };
    case 'on-holiday':
    case 'outside-center-hours':
      return { kind: 'center', id: null };
  }
}
