import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from './room';
import type { GroupId } from './group';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';

/** ULID id prefix for weekly recurring sessions: `wrs_01HW…`. */
export const WEEKLY_RECURRING_SESSION_ID_PREFIX = 'wrs';

export type WeeklyRecurringSessionId = Brand<string, 'WeeklyRecurringSessionId'>;

/**
 * A recurring weekly slot the center schedules: a room booked on one weekday for a
 * `[start, end)` time range, optionally staffed by a teacher and optionally linked
 * to a `Group`. This is the *template* the planner grid (SOU-54) renders and the
 * composite conflict detector (SOU-55) checks against — not a materialized dated
 * occurrence (that concrete `Session` lands in SOU-130).
 *
 * `teacherId` is nullable and typed `EntityId` rather than a `TeacherId` because the
 * Teacher entity's brand is not wired through here yet — it mirrors
 * {@link ScheduledSessionRef}, whose `teacherId` is likewise the generic id. A
 * session may exist before a teacher is assigned; a null teacher simply never
 * participates in a teacher-overlap conflict. Strengthen the brand and add the FK
 * when the Teacher entity's link becomes load-bearing.
 *
 * `groupId` is nullable (SOU-118): the group owns the session's subject, level, and
 * `kind` (regular vs exam-prep), so the enriched planner read model
 * {@link WeeklySessionView} derives those by joining the group. A slot may be booked
 * before it is attached to a group (or its group may be archived); the read model
 * then falls back to a neutral shape (`kind: 'regular'`, no subject/level). No FK,
 * per the sync-order convention — a group can arrive on another device after this
 * row via sync.
 *
 * Not people-like, so it carries no `naturalKey` — a session is identified by its
 * relationships (room + teacher + group + day + time), not by a matching key.
 * Soft-delete only: unscheduling sets `deletedAt`; a tombstoned row still syncs.
 */
export type WeeklyRecurringSession = EntityEnvelope & {
  readonly id: WeeklyRecurringSessionId;
  roomId: RoomId;
  teacherId: EntityId | null;
  groupId: GroupId | null;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/**
 * Project a session onto the tenant-blind {@link ScheduledSessionRef} the
 * `SessionConflictPolicy` consumes: drop the envelope, widen the id to the generic
 * `EntityId`, and omit `teacherId` entirely when null (the ref makes it optional, so
 * under `exactOptionalPropertyTypes` the property must be absent, not `undefined`).
 * The caller is responsible for scoping which sessions it passes in (same center,
 * not soft-deleted) — the ref itself carries no `centerCode`.
 */
export function toScheduledSessionRef(session: WeeklyRecurringSession): ScheduledSessionRef {
  const base = {
    id: session.id as string as EntityId,
    roomId: session.roomId,
    dayOfWeek: session.dayOfWeek,
    start: session.start,
    end: session.end,
  };
  return session.teacherId === null ? base : { ...base, teacherId: session.teacherId };
}
