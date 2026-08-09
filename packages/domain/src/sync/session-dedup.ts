import type { EntityId } from '../value-objects/ids';

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
   * The id of the live (non-tombstoned) session in this center whose
   * `(recurringSessionId, date)` equals the pair, excluding `excludeId`, or
   * null. Reads the projected table so it sees exactly what the unique index
   * would reject.
   */
  findLiveSessionIdByNaturalKey(
    recurringSessionId: string,
    date: string,
    excludeId: EntityId,
  ): EntityId | null;

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
}
