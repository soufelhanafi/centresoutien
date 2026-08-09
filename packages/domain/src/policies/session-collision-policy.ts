import type { EntityId } from '../value-objects/ids';

/**
 * Two replicas materialized the same session occurrence offline — the SOU-56
 * generator is deterministic, so both rows carry the same
 * `(recurringSessionId, date)` natural key but different ULIDs (SOU-188). The
 * clash is settled deterministically and clock-independently: the lower ULID
 * `id` wins and every device converges on it. ULIDs are globally unique and
 * identical on every replica, so all devices reach the same winner with no
 * popup and no timestamp — never wall-clock last-writer-wins.
 */
export type SessionCollisionResolution = {
  readonly winnerId: EntityId;
  readonly loserId: EntityId;
};

/** Settle a session natural-key clash: the lower ULID `id` wins, the higher loses. */
export function resolveSessionCollision(a: EntityId, b: EntityId): SessionCollisionResolution {
  return a < b ? { winnerId: a, loserId: b } : { winnerId: b, loserId: a };
}
