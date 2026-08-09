import type { EntityId, UserId } from '../value-objects/ids';
import type { ChangeLogOp } from './change-log-writer';
import type { ConflictSide } from './conflicts';

/**
 * The entityType string sessions are logged, synced, and projected under — the
 * same key the change-log mapper and the `sessions` table use. Named so the
 * resolver can single out session applies for natural-key collision handling
 * without a magic string.
 */
export const SESSION_ENTITY_TYPE = 'sessions';

/**
 * A settled session natural-key clash surfaced by the resolve step (SOU-188).
 * Deliberately NOT a {@link SyncConflict}: no human is needed, because two
 * replicas materializing the same occurrence is not a real-world disagreement —
 * the generator is deterministic, so the rows are the same session. The winner
 * is the lower ULID; every device converges on it. Surfaced on the sync result
 * so a future admin nudge / log can report it.
 */
export type SessionDedup = {
  readonly entityType: typeof SESSION_ENTITY_TYPE;
  /** The recurring template + date — the natural key the rows collided on. */
  readonly recurringSessionId: string;
  readonly date: string;
  /** The lower-ULID session every replica converges on. */
  readonly winnerId: EntityId;
  /** The higher-ULID session absorbed/retired. */
  readonly loserId: EntityId;
};

/** Stable identity for de-duplicating repeated dedup detections across retries. */
export function sessionDedupKey(dedup: SessionDedup): string {
  return `session-dedup:${dedup.recurringSessionId}:${dedup.date}:${dedup.winnerId}:${dedup.loserId}`;
}

/**
 * The session reads and writes the resolver needs to settle a natural-key clash
 * at apply time, kept off the generic `LocalSyncRepository` (interface
 * segregation): only sessions carry a `(recurring_session_id, date)` matching
 * key. Implemented by the SQLite local-sync adapter, which owns both the
 * projected `sessions` table (what `ux_sessions_recurrence_date` guards) and
 * the shadow sync store.
 *
 * Because the unique index is non-partial, a tombstoned row still occupies the
 * natural-key slot — the loser cannot be soft-deleted to make room for the
 * winner. Convergence therefore rewrites the surviving row IN PLACE: the device
 * that holds the loser rewrites it to the winner's id + data (absorb), or keeps
 * its own row and retires the inbound loser (retire). Both paths leave exactly
 * one live row per natural key and never throw.
 */
export interface SessionDedupStore {
  /**
   * The id + tombstone state of the local session in this center whose
   * `(recurringSessionId, date)` equals the pair, excluding `excludeId`, or
   * null. Returns BOTH live and tombstoned rows — the unique index
   * `ux_sessions_recurrence_date` is non-partial, so a tombstoned row still
   * occupies the slot and is just as capable of rejecting an insert. Reads the
   * projected table so it sees exactly what the index would reject.
   */
  findSessionByNaturalKey(
    recurringSessionId: string,
    date: string,
    excludeId: EntityId,
  ): { id: EntityId; deletedAt: string | null } | null;

  /**
   * The local side of a natural-key clash for the conflict popup: the last
   * change-log write for a session id that is currently SYNCED (no pending
   * write to build the side from). Returns null when the id has no log entry.
   * A conflict's "mine" side needs who/when/what even for a settled row — the
   * change log is the only durable record of it.
   */
  lastLocalSide(entityId: EntityId): ConflictSide | null;

  /**
   * The inbound session is the lower ULID (winner): rewrite the local loser
   * row — held under `fromId` — in place to become the winner (`toId`), with
   * the winner's data + version. Re-points local `attendance_records` that
   * reference `fromId` and moves the shadow entry so the loser's pending push
   * can never resurrect it. Atomic; the natural-key slot never frees.
   */
  absorbSessionAsWinner(input: {
    fromId: EntityId;
    toId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void;

  /**
   * The inbound session is the higher ULID (loser): keep the local winner row
   * (`keptId`) untouched, record the inbound loser's version in the shadow (so
   * re-delivery is skipped), and defensively re-point any local attendance that
   * references `retiredId`. Atomic.
   */
  retireInboundSession(input: {
    keptId: EntityId;
    retiredId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void;

  /**
   * The human-settled natural-key clash (SOU-194): a session delete-vs-edit /
   * field-clash that blocked as a conflict on the local occupied row. This is
   * NOT the generic "write the chosen snapshot under the conflict's id" — the
   * two sides are DIFFERENT ids for the same `(recurring_session_id, date)`
   * slot, so the generic path either re-wedges `ux_sessions_recurrence_date`
   * (take-theirs projects the winner id into a slot the local loser still
   * holds) or silently diverges (take-mine consumes the winner without ever
   * applying it). The human's chosen data therefore survives ALWAYS under the
   * lower-ULID winner id — the id every replica converges on — with the loser
   * retired and attendance re-pointed. Atomic.
   */
  resolveSessionNaturalKey(input: {
    /** The local occupied row id the conflict was keyed on (the loser when ≠ `winnerId`). */
    fromId: EntityId;
    /** The survivor id — lower ULID of the two sides, what every device keeps. */
    winnerId: EntityId;
    /** The retired id — higher ULID of the two sides, never resurrected. */
    loserId: EntityId;
    /** The chosen surviving snapshot, `id` already normalized to `winnerId`. */
    entity: Record<string, unknown>;
    /** The conflict's canonical version (the inbound side's) — stamps the loser shadow so re-delivery is skipped. */
    inboundVersion: number;
    /** Canonical version of `winnerId` the resolution push is based on. */
    baseVersion: number;
    op: ChangeLogOp;
    changedFields: readonly string[];
    updatedBy: UserId;
    at: Date;
  }): void;
}
