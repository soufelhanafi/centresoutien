import type { EntityId } from '../value-objects/ids';

/**
 * Two live `users` rows in one center share a normalized username — each created
 * offline on a different laptop before their first sync. The winner is the
 * GREATEST ULID, matching the read-resolution rule the repositories use
 * (`findByUsername` / `findOwner` / `listActive` order by `id DESC`), so the row
 * every device authenticates against is the same one this surfaced record names
 * as the winner. Unlike subjects/sessions (lowest ULID), the tiebreak direction
 * is chosen to agree with those reads; either way it is deterministic and
 * identical on every device — never wall-clock last-writer-wins.
 */
export type UserCredentialCollisionResolution = {
  readonly winnerId: EntityId;
  readonly loserId: EntityId;
};

/** Settle a user-credential duplicate: the greatest ULID `id` wins (the row reads resolve to). */
export function resolveUserCredentialCollision(
  a: EntityId,
  b: EntityId,
): UserCredentialCollisionResolution {
  return a > b ? { winnerId: a, loserId: b } : { winnerId: b, loserId: a };
}
