import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { RoomId } from './room';
import type { GroupId } from './group';
import type { WeeklyRecurringSessionId } from './weekly-recurring-session';

/** ULID id prefix for materialized sessions: `ses_01HW…`. */
export const SESSION_ID_PREFIX = 'ses';

export type SessionId = Brand<string, 'SessionId'>;

/**
 * A concrete, dated occurrence materialized from a {@link WeeklyRecurringSession}
 * template by the SOU-56 generator: the template's room / teacher / time range,
 * pinned to one calendar `date`. This is what a day column in the calendar shows
 * and what attendance and (later) reports hang off — the template is the rule,
 * the Session is the fact.
 *
 * It mirrors the template's fields plus the date and a link back to its
 * recurrence. `groupId` (SOU-130) is copied from the template's own `groupId`
 * at materialization by the SOU-56 generator — a concrete session never carries
 * a group the template lacks — so subject/level/kind still derive by joining
 * Group, exactly like the template's read model; this entity has no opinion on
 * them beyond the id.
 *
 * `teacherId` is nullable and typed the generic `EntityId` (not a `TeacherId`)
 * for the same reason the template's is: the Teacher entity isn't built yet. A
 * null teacher simply never participates in a teacher-overlap conflict.
 * Strengthen the brand when the Teacher entity arrives.
 *
 * Identity: the ULID `id` is the primary key, but an occurrence's *natural*
 * identity — and the dedup key the persistence-level idempotent upsert (SOU-129)
 * enforces — is `(recurringSessionId, date)`, so both are `readonly`. Re-running
 * the generator over the same window yields the same `(recurringSessionId, date)`
 * pairs; the fresh ULID of a duplicate is discarded by that upsert. `roomId` /
 * `teacherId` / `start` / `end` stay mutable so a single occurrence can later be
 * tweaked (moved rooms, reassigned) without changing its identity.
 *
 * Not people-like — identified by its relationships, not a matching key — so it
 * carries no `naturalKey`. Soft-delete only: cancelling one occurrence sets
 * `deletedAt`; a tombstoned row still syncs.
 */
export type Session = EntityEnvelope & {
  readonly id: SessionId;
  readonly recurringSessionId: WeeklyRecurringSessionId;
  roomId: RoomId;
  teacherId: EntityId | null;
  groupId: GroupId | null;
  readonly date: string; // materialized occurrence, strict 'YYYY-MM-DD'
  start: TimeOfDay;
  end: TimeOfDay;
};
