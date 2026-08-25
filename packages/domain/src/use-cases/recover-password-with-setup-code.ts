import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { SetupCodeRecoveryUnitOfWork } from '../ports/setup-code-recovery-unit-of-work';
import {
  recoverPasswordWithSetupCodeInputSchema,
  type RecoverPasswordWithSetupCodeInput,
} from '../schemas/user';
import { hasEstablishedIdentity } from '../entities/user';
import { resolvePendingInviteByCode } from './pending-invite';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
  type AuthAuditEventType,
} from '../entities/auth-audit-event';
import {
  SetupCodeInvalidError,
  SetupCodeExpiredError,
  SetupCodeAlreadyRedeemedError,
} from '../errors/user-errors';

// Recovery redemption (SOU-303): an already-onboarded staff member whose director
// re-issued a fresh code sets a NEW password. The counterpart to first-login
// RedeemSetupCode, minus identity capture — the account already owns its username,
// full name, and email, so only the password is rotated. Resolves the invite by the
// code (same machinery as first login), then commits through the atomic recovery
// unit so — like the email and recovery-code reset paths — the credential rotation,
// its audit event, and the device-session invalidation land all-or-nothing. An
// un-onboarded invite reaching here (no password ever set) is the wrong flow — it
// must run the identity-capturing onboarding redemption — so it is rejected as an
// opaque invalid code.
export class RecoverPasswordWithSetupCode {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: SetupCodeRecoveryUnitOfWork,
  ) {}

  async execute(input: RecoverPasswordWithSetupCodeInput): Promise<void> {
    const { setupCode, newPassword } = recoverPasswordWithSetupCodeInputSchema.parse(input);

    const now = this.clock.now();
    const invite = await resolvePendingInviteByCode(this.users, this.hasher, setupCode);
    if (invite.user.setupCodeExpiresAt === null || now.getTime() > invite.user.setupCodeExpiresAt) {
      throw new SetupCodeExpiredError();
    }
    if (!hasEstablishedIdentity(invite.user)) throw new SetupCodeInvalidError();

    const replicate = await this.users.participatesInSync(invite.user.id);

    await this.unitOfWork.commit({
      id: invite.user.id,
      expectedSetupCodeHash: invite.setupCodeHash,
      passwordHash: await this.hasher.hash(newPassword),
      redeemedAt: now,
      updatedBy: invite.user.id,
      replicate,
      auditEvents: [this.auditEvent('password-reset-via-setup-code', invite.user.username, now)],
      deviceSessionInvalidatedEvent: this.auditEvent(
        'device-session-invalidated-after-reset',
        invite.user.username,
        now,
      ),
      onCodeAlreadyRedeemed: () => new SetupCodeAlreadyRedeemedError(),
    });
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
