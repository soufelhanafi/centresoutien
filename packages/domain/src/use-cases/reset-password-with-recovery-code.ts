import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { RecoveryCodeResetUnitOfWork } from '../ports/recovery-code-reset-unit-of-work';
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
  type AuthAuditEventType,
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
    private readonly resetUnitOfWork: RecoveryCodeResetUnitOfWork,
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

    const clearDeviceSession = await this.deviceSessions.isRemembered();

    const auditEvents: AuthAuditEvent[] = [
      this.auditEvent('recovery-code-consumed', username, now),
      this.auditEvent('password-reset-via-recovery-code', username, now),
    ];
    if (clearDeviceSession) {
      auditEvents.push(this.auditEvent('device-session-invalidated-after-reset', username, now));
    }

    await this.resetUnitOfWork.commit({
      account,
      consumedCodeId: result.codeId,
      consumedAt: now,
      auditEvents,
      clearDeviceSession,
    });

    return { outcome: 'success' };
  }

  private auditEvent(
    eventType: AuthAuditEventType,
    username: string,
    timestamp: Date,
  ): AuthAuditEvent {
    return {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType,
      username,
      timestamp,
      metadata: {},
    };
  }
}
