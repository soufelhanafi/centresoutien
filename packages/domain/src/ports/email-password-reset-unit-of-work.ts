import type { UserId } from '../entities/user';
import type { AuthAuditEvent } from '../entities/auth-audit-event';

/**
 * The minimal credential write a password reset commits (SOU-303): the target
 * `users` row id, its new hash, and the bumped `updatedAt`. Per-user now — the
 * reset resolves ANY account (owner or staff) by username and rotates that row —
 * so this is expressed in generic `users` terms, not the owner-only AdminAccount.
 */
export type EmailPasswordCredentialWrite = {
  readonly id: UserId;
  readonly passwordHash: string;
  readonly updatedAt: Date;
};

/**
 * The whole set of writes a successful email-verified password reset performs
 * (SOU-273/SOU-303), handed to {@link EmailPasswordResetUnitOfWork.commit} as ONE
 * unit. Mirrors {@link import('./recovery-code-reset-unit-of-work').RecoveryCodeResetUnitOfWork}
 * but has NO code to consume: the mailbox proof is verified by the relay in the
 * main process BEFORE this seam, so the local unit only rotates the credential,
 * logs it, and clears any remembered device session.
 *
 * The use case computes every final value first (the new password hash already
 * sits on `credential`), then delegates persistence so the writes commit
 * all-or-nothing — a reset can never land the new hash while failing to log it or
 * to clear a live session.
 */
export type EmailPasswordResetUnit = {
  /** The `users` row to rotate, carrying the new `passwordHash` and bumped `updatedAt`. */
  readonly credential: EmailPasswordCredentialWrite;
  /**
   * The DOMAIN's replication decision (SOU-258): true when the account already
   * participates in the sync feed, so the reset's password write appends a
   * `users` change_log row in the same transaction. A migrated owner (backfilled
   * by migration 0044, no sync presence) stays device-local. The adapter
   * persists row + log atomically; it never re-derives this policy.
   */
  readonly replicate: boolean;
  /** The audit rows always recorded on success: `password-reset-via-email`. */
  readonly auditEvents: readonly AuthAuditEvent[];
  /**
   * The `device-session-invalidated-after-reset` row, recorded ONLY when the
   * in-transaction check finds a live session to clear — so the log never claims
   * an invalidation that did not happen.
   */
  readonly deviceSessionInvalidatedEvent: AuthAuditEvent;
};

/**
 * Atomic commit seam for
 * {@link import('../use-cases/reset-password-after-email-verification').ResetPasswordAfterEmailVerification}
 * (SOU-273). `commit` performs, atomically inside ONE transaction: save the
 * password, record the always-audit rows, and — iff a live device session is
 * found in the same transaction — clear it and record
 * `deviceSessionInvalidatedEvent`. Any throw rolls the whole unit back (password
 * unchanged, nothing logged, session intact). Like the recovery-code reset unit
 * it writes precomputed values and invents no rule.
 *
 * The mailbox verification (relay `reset-request` / `reset-confirm`) runs BEFORE
 * this seam, in the main process, and is deliberately outside the transaction:
 * only after the relay confirms the code does the caller build this unit.
 */
export interface EmailPasswordResetUnitOfWork {
  /** Persist the whole reset atomically. Must not partially apply on failure. */
  commit(unit: EmailPasswordResetUnit): Promise<void>;
}
