import type { AdminAccount } from '../entities/admin-account';
import type { RecoveryCodeId } from '../entities/recovery-code';
import type { AuthAuditEvent } from '../entities/auth-audit-event';

/**
 * The whole set of writes a successful recovery-code reset performs, handed to
 * {@link RecoveryCodeResetUnitOfWork.commit} as ONE unit. The use case computes
 * every final value first (the new password hash already sits on `account`),
 * then delegates persistence so the writes commit all-or-nothing.
 *
 * Two guards are re-checked INSIDE the transaction rather than trusted from a
 * pre-read, mirroring {@link import('./payment-ledger-unit-of-work').PaymentLedgerUnitOfWork}:
 * the code must still be unconsumed at commit time, and whether a device session
 * is cleared (and its invalidation logged) is derived from the live session row —
 * so a reset racing between verification and commit can neither reuse a spent
 * code nor desync the audit log from what was actually cleared.
 */
export type RecoveryCodeResetUnit = {
  /** The account carrying the new `passwordHash` and bumped `updatedAt`. */
  readonly account: AdminAccount;
  /**
   * The DOMAIN's replication decision (SOU-258): true when the owner already
   * participates in the sync feed, so the reset's password write appends a
   * `users` change_log row in the same transaction. A migrated owner (backfilled
   * by migration 0044, no sync presence) stays device-local. The adapter
   * persists row + log atomically; it never re-derives this policy.
   */
  readonly replicate: boolean;
  /** The recovery code this reset spends; consumed only if still unconsumed in-transaction. */
  readonly consumedCodeId: RecoveryCodeId;
  /** When the code was consumed (from the injected Clock, UTC). */
  readonly consumedAt: Date;
  /**
   * The audit rows always recorded on success: `recovery-code-consumed` and
   * `password-reset-via-recovery-code`.
   */
  readonly auditEvents: readonly AuthAuditEvent[];
  /**
   * The `device-session-invalidated-after-reset` row, recorded ONLY when the
   * in-transaction check finds a live session to clear — so the log never claims
   * an invalidation that did not happen.
   */
  readonly deviceSessionInvalidatedEvent: AuthAuditEvent;
  /**
   * The error to raise (rolling the whole reset back) when the code was already
   * consumed by a racing reset between verification and this commit. The domain
   * owns the decision; the adapter only runs the guarded write and calls this.
   */
  readonly onCodeAlreadyConsumed: () => Error;
};

/**
 * Atomic commit seam for {@link import('../use-cases/reset-password-with-recovery-code').ResetPasswordWithRecoveryCode}
 * (SOU-169). The reset previously ran as independent awaits — the password write
 * and code consume could land while a later step threw, leaving the code spent
 * on an account the user believes was never changed.
 *
 * `commit` performs, atomically inside ONE transaction: save the password,
 * consume the code **iff still unconsumed** (else raise `onCodeAlreadyConsumed`),
 * record the always-audit rows, and — iff a live device session is found in the
 * same transaction — clear it and record `deviceSessionInvalidatedEvent`. Any
 * throw rolls the whole unit back (password unchanged, code not consumed, nothing
 * logged). Like the merge unit-of-work it writes precomputed values and invents
 * no rule; the error *decisions* stay in the injected predicates. Verification
 * and its throttle/audit records run BEFORE this seam and are deliberately
 * outside the transaction (they must persist even when a reset ultimately fails).
 */
export interface RecoveryCodeResetUnitOfWork {
  /** Persist the whole reset atomically. Must not partially apply on failure. */
  commit(unit: RecoveryCodeResetUnit): Promise<void>;
}
