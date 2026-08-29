import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { User, UserId } from '../entities/user';
import type { CenterCode } from '../value-objects/ids';
import type { Email } from '../value-objects/email';

/**
 * The identity a first-login redemption captures (SOU-303): the staff's own
 * username, full name, and (mandatory) contact email — their password-reset
 * channel. Present when the redemption is a first onboarding; absent when it only
 * rotates the password (a director-reissued recovery code for an already-onboarded
 * account). `username` is the display form; the adapter recomputes its normalized
 * key. `email` is already canonicalized by the Email VO.
 */
export type RedeemedIdentity = {
  readonly username: string;
  readonly fullName: string;
  readonly email: Email;
};

/**
 * The setup-code fields a re-issue rotates (SOU-303). Handed to
 * {@link UserRepository.reopenSetupCode}: it updates ONLY these columns (+ the
 * envelope `updatedAt`/`updatedBy`), never identity or credentials, so a re-issue
 * can never clobber a concurrent redemption's chosen username/password by writing
 * back a stale entity snapshot.
 */
export type SetupCodeReissue = {
  readonly id: UserId;
  /** Argon2 hash of the freshly minted one-time code. */
  readonly setupCodeHash: string;
  /** Epoch millis (UTC) when the fresh code expires. */
  readonly setupCodeExpiresAt: number;
  /** When the re-issue happened (UTC, from the Clock port). */
  readonly updatedAt: Date;
  /** Who re-issued it — the director's id. */
  readonly updatedBy: UserId;
};

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
  /**
   * The identity captured at a first onboarding (SOU-303). When present the commit
   * also writes `username` (+ its recomputed normalized key), `full_name`, and
   * `email`; when absent only the password is rotated (recovery). A same-username
   * race that slips past the caller's pre-check is caught by the adapter's
   * in-transaction live-username re-check and surfaced as
   * `UsernameAlreadyTakenError` (migration 0053 relaxed the DB unique index that
   * used to be that guard so cross-device duplicates converge instead of aborting
   * a sync-apply batch).
   */
  readonly identity?: RedeemedIdentity;
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
   * Backs login. Implementations match on the normalized form
   * (`normalizeUsername`: NFC + trim + lower-case), never raw string equality, so
   * casing/whitespace typed at login still resolves the account — the same rule the
   * old admin login used (SOU-153).
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * Insert a deliberately-created local account, atomically rejecting a live
   * username clash with {@link UsernameAlreadyTakenError}. The clash check and the
   * INSERT run in ONE transaction, so two concurrent creates that both pass a prior
   * async check cannot both land — the second is rejected, never merged (users are
   * created deliberately, not matched in from two devices). This is the create-time
   * uniqueness guard; a plain async pre-check is not enough because password hashing
   * yields the event loop between check and write.
   *
   * Distinct from the inherited permissive `save` upsert ON PURPOSE: `save` backs
   * the sync-apply path, which MUST stay permissive so a peer's converging
   * same-username row can apply and reconcile at read (migration 0053 dropped the DB
   * unique index for exactly this reason). Local creation uses this guarded method
   * instead. Records the change_log append in the same transaction so the account
   * replicates.
   */
  createLocalAccount(user: User): Promise<void>;

  /** Every live user of the center, tombstones excluded. Backs the user-management list. */
  listActive(centerCode: CenterCode): Promise<readonly User[]>;

  /** The live owner of the center, or null before first-run. Backs owner-existence checks. */
  findOwner(): Promise<User | null>;

  /**
   * True when this user's row already participates in the sync feed — created
   * through the logging repository (it has a `users` change_log row) or pulled from
   * the hub (it has a `sync_local_entity` shadow). Feeds the per-account replication
   * decision on a password reset (SOU-258/SOU-303): a participating account appends
   * a change_log row so the rotated hash reaches paired devices; a migrated,
   * device-local owner (backfilled by migration 0044, neither present) stays local
   * — pushing it would collide on `ux_users_username_live`. Never gates a write.
   */
  participatesInSync(userId: UserId): Promise<boolean>;

  /**
   * Every live user with a setup code that has NOT yet been redeemed (SOU-303) —
   * the currently-open invites. Backs code-first redemption/validation, which
   * locate an invite by the code rather than a username (the staff have not chosen
   * one yet). EXPIRED-but-unredeemed codes are included so the caller can report
   * "expired" distinctly from "invalid"; the caller filters on `setupCodeExpiresAt`.
   */
  listPendingInvites(): Promise<readonly User[]>;

  /**
   * Atomically redeem a pending setup code (SOU-252/SOU-303). Sets `passwordHash`,
   * clears BOTH the setup-code hash and its expiry, stamps `setupCodeRedeemedAt`,
   * and — when `redemption.identity` is present (a first onboarding) — also writes
   * the chosen `username` (+ recomputed normalized key), `full_name`, and `email`.
   * All of it applies ONLY while the row is still pending on `expectedSetupCodeHash`
   * and not yet redeemed. This is a compare-and-set, not a read-modify-write: two
   * concurrent redemptions cannot both win, and a second attempt after a redemption
   * matches no row. Returns `true` when a row was redeemed, `false` when none
   * matched (the caller maps `false` to `SetupCodeAlreadyRedeemedError`); throws
   * `UsernameAlreadyTakenError` when a captured username collides with another live
   * account (the uniqueness index is the last-resort race guard). Records the
   * change_log append in the same transaction so the redeemed account replicates.
   */
  markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean>;

  /**
   * Re-open a setup code on an existing account (SOU-303 director re-issue). Rotates
   * ONLY the setup-code fields (`setup_code_hash`, `setup_code_expires_at`, cleared
   * `setup_code_redeemed_at`) plus `updated_at`/`updated_by` on the live row, and
   * appends the change_log in the same transaction. Deliberately a targeted update,
   * NOT a full-entity upsert: identity and credentials are untouched, so a re-issue
   * running concurrently with a redemption can never revert the chosen username or
   * password by writing back a stale snapshot. Returns the updated {@link User}, or
   * `null` when no live row matched the id (deleted meanwhile).
   */
  reopenSetupCode(reissue: SetupCodeReissue): Promise<User | null>;
}
