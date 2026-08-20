import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';
import type { EntityId } from '../value-objects/ids';
import { toMinutes, type TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from './room';
import type { GroupId } from './group';
import {
  InvalidSessionValidityRangeError,
  MalformedSessionTimeError,
  type ScheduledSessionRef,
} from '../errors/scheduling-errors';

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
 *
 * `active` mirrors `Room.active` / `Group.active`: a "temporarily paused" toggle,
 * set `true` on creation. The live/archived lifecycle is driven by the envelope
 * `deletedAt`, never by this flag.
 *
 * `conflictAccepted` (SOU-183) marks a slot deliberately booked over a flagged
 * schedule conflict (room double-book, teacher double-book, outside center hours,
 * or an out-of-window teacher-availability warning — SOU-283) during auto
 * session-generation commit or a forced manual write. It defaults to `false` for
 * every ordinary write and is only set `true` when the caller forced the block
 * past `assertScheduleFree`. It is an intentional-conflict audit marker — never a
 * license to skip the seat-fit / not-found hard checks, which always run.
 *
 * Set at create and **re-stamped on edit** (SOU-283): a forced
 * {@link UpdateWeeklyRecurringSession} sets it `true`, and an ordinary
 * (non-forced) edit resets it to `false`, so the flag always reflects the latest
 * acceptance decision rather than a stale one from creation.
 *
 * `validFrom` / `validTo` are the recurrence's validity window as strict civil
 * dates (`YYYY-MM-DD`, so they compare lexicographically = chronologically). Both
 * are nullable: `validFrom: null` means "no lower bound" and `validTo: null` means
 * "open-ended", mirroring `StudentSubscription.endMonth`'s open-ended convention
 * (extended to the lower bound so migration 0022 can add the columns to existing
 * rows without a synthetic default — `sync-safe-entities` / `migration-authoring`).
 * When both are present the invariant `validFrom <= validTo` holds
 * ({@link createWeeklyRecurringSession} enforces it). Applying the window to
 * conflict detection / materialization is SOU-55 / SOU-131 work, not here.
 */
export type WeeklyRecurringSession = EntityEnvelope & {
  readonly id: WeeklyRecurringSessionId;
  roomId: RoomId;
  teacherId: EntityId | null;
  groupId: GroupId | null;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  conflictAccepted: boolean;
};

/**
 * The fields {@link createWeeklyRecurringSession} needs to mint a session: its
 * pre-generated `id`, a pre-built envelope, and the domain fields. Keeping the id
 * and envelope as inputs (rather than a `Clock` / `IdGenerator`) keeps the factory
 * pure and free of ports — the SOU-131 write use case builds them (`ids.next` +
 * `newEnvelope`) and hands them in. `active` is optional and defaults to `true`.
 */
export type WeeklyRecurringSessionDraft = {
  readonly id: WeeklyRecurringSessionId;
  readonly envelope: EntityEnvelope;
  readonly roomId: RoomId;
  readonly teacherId: EntityId | null;
  readonly groupId: GroupId | null;
  readonly dayOfWeek: WeekdayIndex;
  readonly start: TimeOfDay;
  readonly end: TimeOfDay;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly active?: boolean;
  readonly conflictAccepted?: boolean;
};

/**
 * Invariant-enforcing factory for a {@link WeeklyRecurringSession} (SOU-52). It is
 * the one place the structural invariants live, so every write path (the SOU-131
 * use case, imports, tests) mints a session the same way:
 *
 * - **`start < end`** — a backwards or zero-length slot throws
 *   {@link MalformedSessionTimeError} (the same error the conflict policy raises,
 *   so "malformed time" means one thing across the domain).
 * - **`validFrom <= validTo`** — when both bounds are set, an inverted window
 *   throws {@link InvalidSessionValidityRangeError}. A `null` bound is unbounded
 *   and never conflicts.
 * - **`active` defaults to `true`** (mirrors `Room` / `Subject` / `Teacher`).
 *
 * Civil-date *well-formedness* (`YYYY-MM-DD`) is trusted here, exactly like
 * `DateRange`: the boundary schema (IPC, SOU-131) validates the shape; this pure
 * factory validates ordering. `withinCenterHours` and "teacher must teach the
 * subject" are separate checks the write use case runs against loaded data — not
 * the factory's job (it has no center hours, no teacher, no group in hand).
 */
export function createWeeklyRecurringSession(
  draft: WeeklyRecurringSessionDraft,
): WeeklyRecurringSession {
  if (toMinutes(draft.start) >= toMinutes(draft.end)) {
    throw new MalformedSessionTimeError(draft.dayOfWeek, draft.start, draft.end);
  }
  if (draft.validFrom !== null && draft.validTo !== null && draft.validTo < draft.validFrom) {
    throw new InvalidSessionValidityRangeError(draft.validFrom, draft.validTo);
  }
  return {
    id: draft.id,
    ...draft.envelope,
    roomId: draft.roomId,
    teacherId: draft.teacherId,
    groupId: draft.groupId,
    dayOfWeek: draft.dayOfWeek,
    start: draft.start,
    end: draft.end,
    active: draft.active ?? true,
    validFrom: draft.validFrom,
    validTo: draft.validTo,
    conflictAccepted: draft.conflictAccepted ?? false,
  };
}

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
