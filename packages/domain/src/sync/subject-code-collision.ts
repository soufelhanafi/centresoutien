import type { CenterCode, EntityId } from '../value-objects/ids';

/**
 * The entityType string subjects are logged, synced, and projected under — the
 * same key the change-log mapper and the `subjects` table use. Named so the
 * resolver can single out subject applies for code-collision handling without a
 * magic string.
 */
export const SUBJECT_ENTITY_TYPE = 'subjects';

/**
 * A settled subject-code clash surfaced by the resolve step (SOU-122). It is
 * deliberately NOT a {@link SyncConflict}: no human is needed, because the
 * winner is deterministic (lower ULID) and the loser's `code` is auto-nulled so
 * both rows survive — the project's "flag duplicates, never hard-reject" rule.
 * Surfaced on the sync result so a future admin nudge / log can report it; it
 * carries no popup or resolution state of its own.
 */
export type SubjectCodeCollision = {
  readonly entityType: typeof SUBJECT_ENTITY_TYPE;
  /** The clashing code, kept on the winner and nulled on the loser. */
  readonly code: string;
  /** The lower-ULID subject that keeps the code. */
  readonly winnerId: EntityId;
  /** The higher-ULID subject whose code was nulled. */
  readonly loserId: EntityId;
};

/** Stable identity for de-duplicating repeated collision detections across retries. */
export function subjectCodeCollisionKey(collision: SubjectCodeCollision): string {
  return `subject-code-collision:${collision.code}:${collision.winnerId}:${collision.loserId}`;
}

/**
 * The subject reads and writes the resolver needs to settle a code clash at
 * apply time, kept off the generic `LocalSyncRepository` (interface
 * segregation): only subjects carry a `code` matching key. Implemented by the
 * SQLite local-sync adapter, which owns both the projected `subjects` table
 * (what `ux_subjects_code` guards) and the shadow sync store.
 */
export interface SubjectCodeCollisionStore {
  /**
   * The id of the live (non-tombstoned) subject in `centerCode` whose `code`
   * equals `code`, excluding `excludeId`, or null. Reads the projected table so
   * it sees exactly what the partial unique index would reject.
   */
  findLiveSubjectIdByCode(
    centerCode: CenterCode,
    code: string,
    excludeId: EntityId,
  ): EntityId | null;

  /**
   * Null the `code` of the local subject `entityId` — the collision loser — on
   * both the projected `subjects` row and the shadow snapshot, so a subsequent
   * winner apply cannot violate `ux_subjects_code`. Idempotent; the row itself
   * survives (soft-delete philosophy — the loser is kept, only its code freed).
   */
  clearSubjectCode(entityId: EntityId): void;
}
