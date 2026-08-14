import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { User, UserId } from '../entities/user';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for {@link User} (SOU-252). Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the username lookup login and invite-creation
 * need.
 *
 * The database file IS the center boundary (one encrypted SQLCipher DB per
 * center), so `findByUsername` needs no center argument — it can only ever see
 * one center's users. `listActive` still takes the `centerCode` for parity with
 * the other repositories and as a defensive tenant scope.
 */
export interface UserRepository extends SoftDeletableRepository<UserId, User> {
  /**
   * The live (non-tombstoned) user whose normalized username matches, or null.
   * Backs login and the create-time uniqueness guard. Implementations match on
   * the normalized form (`normalizeUsername`: NFC + trim + lower-case), never
   * raw string equality, so casing/whitespace typed at login still resolves the
   * account — the same rule the old admin login used (SOU-153).
   */
  findByUsername(username: string): Promise<User | null>;

  /** Every live user of the center, tombstones excluded. Backs the user-management list. */
  listActive(centerCode: CenterCode): Promise<readonly User[]>;

  /** The live owner of the center, or null before first-run. Backs owner-existence checks. */
  findOwner(): Promise<User | null>;
}
