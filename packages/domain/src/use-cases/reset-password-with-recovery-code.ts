import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { RecoveryCodeRepository } from '../ports/recovery-code-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { DeviceSessionService } from '../services/device-session-service';
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

export type ResetPasswordWithRecoveryCodeResult =
  | { readonly outcome: 'success' }
  | { readonly outcome: 'locked-out'; readonly lockedUntil: number };

export class ResetPasswordWithRecoveryCode {
  constructor(
    private readonly verifyCode: VerifyRecoveryCode,
    private readonly accounts: AdminAccountRepository,
    private readonly codeRepo: RecoveryCodeRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly deviceSessions: DeviceSessionService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: ResetPasswordWithRecoveryCodeInput,
  ): Promise<ResetPasswordWithRecoveryCodeResult> {
    const { recoveryCode, newPassword } = resetPasswordWithRecoveryCodeSchema.parse(input);
    const username = input.username;

    const account = await this.accounts.findOnly();
    if (!account) throw new AdminAccountNotFoundError();

    const result = await this.verifyCode.execute({ recoveryCode, username });
    if (result.outcome === 'locked-out') {
      return { outcome: 'locked-out', lockedUntil: result.lockedUntil };
    }

    const now = this.clock.now();
    account.passwordHash = await this.hasher.hash(newPassword);
    account.updatedAt = now;
    await this.accounts.save(account);

    await this.codeRepo.consumeById(result.codeId, now);

    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'recovery-code-consumed',
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(event);

    const resetEvent: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'password-reset-via-recovery-code',
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(resetEvent);

    const sessionInvalidated = await this.deviceSessions.forget();

    if (sessionInvalidated) {
      const sessionInvalidatedEvent: AuthAuditEvent = {
        id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
        eventType: 'device-session-invalidated-after-reset',
        username,
        timestamp: now,
        metadata: {},
      };
      await this.auditLog.record(sessionInvalidatedEvent);
    }

    return { outcome: 'success' };
  }
}
