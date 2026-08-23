import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { EmailPasswordResetUnitOfWork } from '../ports/email-password-reset-unit-of-work';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { resetPasswordAfterEmailVerificationSchema } from '../schemas/email-reset';
import { AdminAccountNotFoundError } from '../errors/auth-errors';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
  type AuthAuditEventType,
} from '../entities/auth-audit-event';

export type ResetPasswordAfterEmailVerificationInput = {
  newPassword: string;
  username: string;
};

export type ResetPasswordAfterEmailVerificationResult = { readonly outcome: 'success' };

/**
 * Rotates the local password once the owner has proved control of their contact
 * mailbox (SOU-273). The email path's counterpart to
 * {@link import('./reset-password-with-recovery-code').ResetPasswordWithRecoveryCode}:
 * same local tail (hash the new password, bump `updatedAt`, atomically clear any
 * remembered device session, log the reset) minus the recovery-code verification
 * and consumption.
 *
 * CALLER CONTRACT: this use case performs NO mailbox verification of its own — the
 * relay `reset-request`/`reset-confirm` round-trip runs in the main process and
 * must succeed before this executes. Keeping the relay call and this reset in the
 * main IPC handler (never exposed to the renderer as a standalone capability) is
 * what stops the renderer from resetting the password without proving the code.
 */
export class ResetPasswordAfterEmailVerification {
  constructor(
    private readonly accounts: AdminAccountRepository,
    private readonly resetUnitOfWork: EmailPasswordResetUnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: ResetPasswordAfterEmailVerificationInput,
  ): Promise<ResetPasswordAfterEmailVerificationResult> {
    const { newPassword } = resetPasswordAfterEmailVerificationSchema.parse(input);
    const username = input.username;

    const account = await this.accounts.findOnly();
    if (!account) throw new AdminAccountNotFoundError();

    const now = this.clock.now();
    account.passwordHash = await this.hasher.hash(newPassword);
    account.updatedAt = now;
    const replicate = await this.accounts.participatesInSync(account.id);

    await this.resetUnitOfWork.commit({
      account,
      replicate,
      auditEvents: [this.auditEvent('password-reset-via-email', username, now)],
      deviceSessionInvalidatedEvent: this.auditEvent(
        'device-session-invalidated-after-reset',
        username,
        now,
      ),
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
