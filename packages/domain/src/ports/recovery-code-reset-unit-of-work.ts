import type { AdminAccount } from '../entities/admin-account';
import type { RecoveryCodeId } from '../entities/recovery-code';
import type { AuthAuditEvent } from '../entities/auth-audit-event';

/**
 * The whole set of writes a successful recovery-code reset performs, handed to
 * {@link RecoveryCodeResetUnitOfWork.commit} as ONE unit. The use case computes
 * every final value first (the new password hash already sits on `account`),
 * then delegates the persistence so the four writes commit all-or-nothing.
 */
export type RecoveryCodeResetUnit = {
  /** The account carrying the new `passwordHash` and bumped `updatedAt`. */
  readonly account: AdminAccount;
  /** The recovery code spent by this reset. */
  readonly consumedCodeId: RecoveryCodeId;
  /** When the code was consumed (from the injected Clock, UTC). */
  readonly consumedAt: Date;
  /**
   * The audit rows to append: `recovery-code-consumed`,
   * `password-reset-via-recovery-code`, and — only when a remembered session
   * was actually cleared — `device-session-invalidated-after-reset`.
   */
  readonly auditEvents: readonly AuthAuditEvent[];
  /**
   * Whether to clear the remembered device session in the same transaction.
   * `false` when no session was remembered, so no redundant write is issued and
   * no invalidation event is present in `auditEvents`.
   */
  readonly clearDeviceSession: boolean;
};

/**
 * Atomic commit seam for {@link import('../use-cases/reset-password-with-recovery-code').ResetPasswordWithRecoveryCode}
 * (SOU-169). The reset previously ran as independent awaits — the password write
 * and code consume could land while a later step threw, leaving the code spent
 * on an account the user believes was never changed.
 *
 * `commit` persists the password change, the code consume, the audit rows, and
 * the optional device-session clear inside a SINGLE transaction: any failure
 * rolls the whole unit back (password unchanged, code not consumed, nothing
 * logged), so the operation is all-or-nothing. Like the merge unit-of-work it
 * only writes precomputed values — it carries no business decisions, invents no
 * error. Verification and its throttle/audit records happen BEFORE this seam and
 * are deliberately outside the transaction (they must persist even when a reset
 * ultimately fails).
 */
export interface RecoveryCodeResetUnitOfWork {
  /** Persist the whole reset atomically. Must not partially apply on failure. */
  commit(unit: RecoveryCodeResetUnit): Promise<void>;
}
