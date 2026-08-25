import type { UserId } from '../entities/user';
import type { AuthAuditEvent } from '../entities/auth-audit-event';

/**
 * The whole set of writes a director-reissued-code password recovery performs
 * (SOU-303), handed to {@link SetupCodeRecoveryUnitOfWork.commit} as ONE unit.
 * The counterpart to the email / recovery-code reset units: an already-onboarded
 * staff member redeems a fresh code to set a new password, so this rotates the
 * credential, logs the reset, and clears any remembered device session — the same
 * security guarantee the other reset paths give — while keeping the setup-code
 * single-use compare-and-set.
 *
 * The use case computes every final value first, then delegates persistence so the
 * writes commit all-or-nothing: a recovery can never land the new hash while
 * failing to log it or to clear a live session. Two things are re-checked INSIDE
 * the transaction, never trusted from a pre-read: the code must still be pending on
 * `expectedSetupCodeHash` at commit time (else `onCodeAlreadyRedeemed` is raised
 * and the whole unit rolls back), and whether a device session is cleared (and its
 * invalidation logged) is derived from the live session row.
 */
export type SetupCodeRecoveryUnit = {
  /** The user whose password is rotated. */
  readonly id: UserId;
  /** The pending `setupCodeHash` the use case verified against — the CAS guard. */
  readonly expectedSetupCodeHash: string;
  /** The new Argon2id password hash to set (clears the setup code). */
  readonly passwordHash: string;
  /** When the recovery happened (UTC, from the Clock port). */
  readonly redeemedAt: Date;
  /** Who committed it — the recovering user's own id. */
  readonly updatedBy: UserId;
  /**
   * The DOMAIN's replication decision (SOU-258): true when the account participates
   * in the sync feed, so the password write appends a `users` change_log row in the
   * same transaction. Computed by the use case via `participatesInSync`.
   */
  readonly replicate: boolean;
  /** The audit rows always recorded on success: `password-reset-via-setup-code`. */
  readonly auditEvents: readonly AuthAuditEvent[];
  /**
   * The `device-session-invalidated-after-reset` row, recorded ONLY when the
   * in-transaction check finds a live session to clear — so the log never claims an
   * invalidation that did not happen.
   */
  readonly deviceSessionInvalidatedEvent: AuthAuditEvent;
  /**
   * The error to raise (rolling the whole recovery back) when the code was already
   * redeemed by a racing redemption between verification and this commit. The
   * domain owns the decision; the adapter only runs the guarded write and calls this.
   */
  readonly onCodeAlreadyRedeemed: () => Error;
};

/**
 * Atomic commit seam for
 * {@link import('../use-cases/recover-password-with-setup-code').RecoverPasswordWithSetupCode}
 * (SOU-303). `commit` performs, atomically inside ONE transaction: rotate the
 * password via the setup-code compare-and-set (else raise `onCodeAlreadyRedeemed`),
 * record the always-audit rows, and — iff a live device session is found in the
 * same transaction — clear it and record `deviceSessionInvalidatedEvent`. Any throw
 * rolls the whole unit back. The mailbox/code proof is resolved BEFORE this seam.
 */
export interface SetupCodeRecoveryUnitOfWork {
  /** Persist the whole recovery atomically. Must not partially apply on failure. */
  commit(unit: SetupCodeRecoveryUnit): Promise<void>;
}
