import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { resetPasswordWithRecoveryCodeSchema } from '../schemas/recovery-code';
import { AdminAccountNotFoundError } from '../errors/auth-errors';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';
import type { VerifyRecoveryCode } from './verify-recovery-code';

export type ResetPasswordWithRecoveryCodeInput = {
  recoveryCode: string;
  newPassword: string;
  username: string;
};

/**
 * Orchestrates a password reset via recovery code (SOU-154).
 * 1. Validates and consumes the recovery code.
 * 2. Hashes and persists the new password (bypasses current-password gating,
 *    which is irrelevant here — the code is proof of ownership).
 * 3. Records an audit event.
 */
export class ResetPasswordWithRecoveryCode {
  constructor(
    private readonly verifyCode: VerifyRecoveryCode,
    private readonly accounts: AdminAccountRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: ResetPasswordWithRecoveryCodeInput): Promise<void> {
    const { recoveryCode, newPassword } = resetPasswordWithRecoveryCodeSchema.parse(input);
    const username = input.username;

    await this.verifyCode.execute({ recoveryCode, username });

    const account = await this.accounts.findOnly();
    if (!account) throw new AdminAccountNotFoundError();

    const now = this.clock.now();
    account.passwordHash = await this.hasher.hash(newPassword);
    account.updatedAt = now;
    await this.accounts.save(account);

    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'password-reset-via-recovery-code',
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(event);
  }
}
