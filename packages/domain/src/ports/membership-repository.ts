import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Membership, MembershipId } from '../entities/membership';
import type { CenterCode, UserId } from '../value-objects/ids';

/**
 * Persistence port for {@link Membership}. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) — a revoked membership is a tombstone, never a
 * `DELETE`. No adapter ships in SOU-95: persistence is deferred to the cloud
 * tier (`apps/api`); this contract is what the future adapter and the in-memory
 * test fake both satisfy.
 */
export interface MembershipRepository extends SoftDeletableRepository<MembershipId, Membership> {
  /**
   * The user's live membership in **one specific** center, or null when the user
   * is not a member there (or the membership was revoked). This is the anchor of
   * center-scoped authorization: the caller passes the SELECTED center, so a
   * membership in center A never authorizes access to center B — the lookup for
   * B simply returns null. Tombstoned (revoked) memberships are excluded.
   */
  findByUserAndCentre(userId: UserId, centreId: CenterCode): Promise<Membership | null>;

  /**
   * Every live center membership of the user, for the center switcher's list of
   * accessible centers. Excludes tombstones. Never merges data across centers —
   * it only enumerates which centers the user may open, each still its own tenant.
   */
  listByUser(userId: UserId): Promise<readonly Membership[]>;
}
