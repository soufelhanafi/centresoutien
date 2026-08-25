import type { CenterCode, EntityId } from '../value-objects/ids';

/**
 * The entityType string users are logged, synced, and projected under — the same
 * key the change-log mapper and the `users` table use. Named so the resolver can
 * single out user applies for duplicate detection without a magic string.
 */
export const USER_ENTITY_TYPE = 'users';

/**
 * A duplicate credential account surfaced by the resolve step: two live `users`
 * rows in one center share a normalized username — each created offline on a
 * different laptop (typically the owner, auto-created by first-run on every
 * device), so they carry distinct ULIDs for the same person. Since migration
 * 0053 the DB no longer rejects this, and reads converge on the greatest-ULID
 * winner; the loser's credential still exists but no longer authenticates. That
 * is invisible on its own, so — unlike a subject-code clash, which is harmless —
 * a CREDENTIAL divergence is surfaced here for a UI nudge ("réinitialisez le mot
 * de passe si vous ne pouvez pas vous connecter"). It is NOT a {@link SyncConflict}:
 * no popup, no human resolution step; the winner is deterministic and every
 * device converges on it. Password hashes are salted, so we cannot tell a
 * same-password duplicate from a different-password one — the nudge fires for any
 * duplicate and its advice (reset if you cannot sign in) is safe either way.
 */
export type UserCredentialDuplicate = {
  readonly entityType: typeof USER_ENTITY_TYPE;
  /** The shared normalized username the two rows collided on. */
  readonly username: string;
  /** The greatest-ULID row every device's reads resolve to (the live credential). */
  readonly winnerId: EntityId;
  /** The lower-ULID row now shadowed — its password no longer authenticates. */
  readonly loserId: EntityId;
};

/** Stable identity for de-duplicating repeated detections across retries. */
export function userCredentialDuplicateKey(duplicate: UserCredentialDuplicate): string {
  return `user-credential-duplicate:${duplicate.username}:${duplicate.winnerId}:${duplicate.loserId}`;
}

/**
 * The user read the resolver needs to notice a same-username duplicate at apply
 * time, kept off the generic `LocalSyncRepository` (interface segregation): only
 * users carry a `username_normalized` matching key. Implemented by the SQLite
 * local-sync adapter, which owns the projected `users` table.
 */
export interface UserCredentialDuplicateStore {
  /**
   * The id of a live (non-tombstoned) user in `centerCode` whose
   * `username_normalized` equals `usernameNormalized`, excluding `excludeId`, or
   * null. Reads the projected table so it sees exactly the rows that now coexist
   * after migration 0053 relaxed the live-username unique index.
   */
  findLiveUserIdByUsername(
    centerCode: CenterCode,
    usernameNormalized: string,
    excludeId: EntityId,
  ): EntityId | null;
}
