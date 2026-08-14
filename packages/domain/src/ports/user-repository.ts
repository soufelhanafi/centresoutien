import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { User, UserId } from '../entities/user';
import type { CenterCode } from '../value-objects/ids';

/**
 * The final values a setup-code redemption commits, plus the pending hash it must
 * still match. Handed to {@link UserRepository.markSetupCodeRedeemed} as a
 * compare-and-set: the write applies only while the row is still pending on
 * exactly `expectedSetupCodeHash`.
 */
export type SetupCodeRedemption = {
  readonly id: UserId;
  /** The pending `setupCodeHash` the use case verified against — the CAS guard. */
  readonly expectedSetupCodeHash: string;
  /** The new Argon2id password hash to set (clears the setup code). */
  readonly passwordHash: string;
  /** When the redemption happened (UTC, from the Clock port). */
  readonly redeemedAt: Date;
  /** Who committed it — the redeeming user's own id. */
  readonly updatedBy: UserId;
};

/**
 * Persistence port for {@link User} (SOU-252). Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the username lookup login and invite-creation
 * need, plus an atomic redemption.
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

  /**
   * Atomically redeem a pending setup code (SOU-252). Sets `passwordHash`, clears
   * BOTH the setup-code hash and its expiry, and stamps `setupCodeRedeemedAt` —
   * but ONLY while the row is still pending on `expectedSetupCodeHash` and not yet
   * redeemed. This is a compare-and-set, not a read-modify-write: two concurrent
   * redemptions cannot both win, and a second attempt after a redemption matches
   * no row. Returns `true` when a row was redeemed, `false` when none matched (the
   * caller maps `false` to `SetupCodeAlreadyRedeemedError`). Records the change_log
   * append in the same transaction so the redeemed account replicates.
   */
  markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean>;
}
