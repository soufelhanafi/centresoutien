import type { UserRepository } from '../ports/user-repository';
import type { EmailPasswordResetUnitOfWork } from '../ports/email-password-reset-unit-of-work';
import type { LoginThrottleStore } from '../ports/login-throttle-store';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { resetPasswordAfterEmailVerificationSchema } from '../schemas/email-reset';
import { UserNotFoundError } from '../errors/user-errors';
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
 * Rotates the local password once a staff member (or the owner) has proved control
 * of their contact mailbox (SOU-273, generalized per-user in SOU-303). The account
 * is resolved by USERNAME, not `findOwner()` — every account with an email on file
 * can self-reset, not just the owner. Same local tail as the recovery-code reset:
 * hash the new password, bump `updatedAt`, atomically clear any remembered device
 * session, log the reset. The replication decision (SOU-258) is per-account: a
 * sync-participating row appends a `users` change_log entry; a migrated,
 * device-local owner stays local.
 *
 * A successful reset also clears the console-wide login throttle (SOU-27). A user
 * who reaches this flow has almost always tripped the lockout by guessing the
 * password they came here to reset; leaving `auth_lockout` armed would refuse the
 * NEW password at the next login for the full cooldown, since `AttemptLogin`
 * short-circuits on an active lock before it ever verifies. Proving control of the
 * mailbox is strictly stronger than a login, so the guess counter is retired here.
 *
 * CALLER CONTRACT: this use case performs NO mailbox verification of its own — the
 * relay `reset-request`/`reset-confirm` round-trip runs in the main process and
 * must succeed before this executes. Keeping the relay call and this reset in the
 * main IPC handler (never exposed to the renderer as a standalone capability) is
 * what stops the renderer from resetting the password without proving the code.
 */
export class ResetPasswordAfterEmailVerification {
  constructor(
    private readonly users: UserRepository,
    private readonly resetUnitOfWork: EmailPasswordResetUnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly loginThrottle: LoginThrottleStore,
  ) {}

  async execute(
    input: ResetPasswordAfterEmailVerificationInput,
  ): Promise<ResetPasswordAfterEmailVerificationResult> {
    const { newPassword } = resetPasswordAfterEmailVerificationSchema.parse(input);
    const username = input.username;

    const user = await this.users.findByUsername(username);
    if (user === null) throw new UserNotFoundError();

    const now = this.clock.now();
    const passwordHash = await this.hasher.hash(newPassword);
    const replicate = await this.users.participatesInSync(user.id);

    await this.resetUnitOfWork.commit({
      credential: { id: user.id, passwordHash, updatedAt: now },
      replicate,
      auditEvents: [this.auditEvent('password-reset-via-email', username, now)],
      deviceSessionInvalidatedEvent: this.auditEvent(
        'device-session-invalidated-after-reset',
        username,
        now,
      ),
    });

    await this.loginThrottle.reset();

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
