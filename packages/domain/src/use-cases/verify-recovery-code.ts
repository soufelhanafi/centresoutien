import type { RecoveryCodeRepository } from '../ports/recovery-code-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { LoginThrottleStore } from '../ports/login-throttle-store';
import type { LoginThrottlePolicy } from '../policies/login-throttle-policy';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { recoveryCodeSchema } from '../schemas/recovery-code';
import type { LockoutState } from '../value-objects/lockout-state';
import { InvalidRecoveryCodeError, NoRecoveryCodesError } from '../errors/auth-errors';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';

export type VerifyRecoveryCodeInput = {
  recoveryCode: string;
  username: string;
};

export type VerifyRecoveryCodeResult =
  | { readonly outcome: 'success' }
  | { readonly outcome: 'invalid-code'; readonly remainingAttempts: number }
  | { readonly outcome: 'locked-out'; readonly lockedUntil: number };

export class VerifyRecoveryCode {
  constructor(
    private readonly codes: RecoveryCodeRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly throttle: LoginThrottleStore,
    private readonly policy: LoginThrottlePolicy,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: VerifyRecoveryCodeInput): Promise<VerifyRecoveryCodeResult> {
    const plain = recoveryCodeSchema.parse(input.recoveryCode);
    const now = this.clock.now();

    const state = await this.throttle.get();
    const lockedUntil = this.policy.lockActiveUntil(state, now);
    if (lockedUntil !== null) return { outcome: 'locked-out', lockedUntil };

    const unconsumed = await this.codes.findAllUnconsumed();
    if (unconsumed.length === 0) {
      await this.recordFailedAttempt(input.username, state, now);
      throw new NoRecoveryCodesError();
    }

    for (const code of unconsumed) {
      if (await this.hasher.verify(code.codeHash, plain)) {
        await this.throttle.reset();
        await this.codes.consumeById(code.id, now);

        const event: AuthAuditEvent = {
          id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
          eventType: 'recovery-code-consumed',
          username: input.username,
          timestamp: now,
          metadata: {},
        };
        await this.auditLog.record(event);
        return { outcome: 'success' };
      }
    }

    await this.recordFailedAttempt(input.username, state, now);
    throw new InvalidRecoveryCodeError();
  }

  private async recordFailedAttempt(
    username: string,
    state: LockoutState,
    now: Date,
  ) {
    const next = this.policy.registerFailure(state, now);
    await this.throttle.save(next);

    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'recovery-code-failed',
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(event);

    const lockedAfter = this.policy.lockActiveUntil(next, now);
    if (lockedAfter !== null)
      throw Object.assign(new InvalidRecoveryCodeError(), { lockedUntil: lockedAfter });
  }
}
