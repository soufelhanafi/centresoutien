import type { EntityId } from '../value-objects/ids';

/**
 * Two live subjects in one center ended up with the same `code` — each created
 * offline on a different replica, both passing their own local `ux_subjects_code`
 * guard before either synced (SOU-122). The clash is settled deterministically
 * and clock-independently: the lower ULID `id` keeps the code, the higher loses
 * it (its `code` is nulled). ULIDs are globally unique and identical on every
 * replica, so every device reaches the same winner with no popup and no
 * timestamp — never wall-clock last-writer-wins.
 */
export type SubjectCodeCollisionResolution = {
  readonly winnerId: EntityId;
  readonly loserId: EntityId;
};

/** Settle a subject-code clash: the lower ULID `id` wins, the higher loses. */
export function resolveSubjectCodeCollision(
  a: EntityId,
  b: EntityId,
): SubjectCodeCollisionResolution {
  return a < b ? { winnerId: a, loserId: b } : { winnerId: b, loserId: a };
}
