import type { RecoveryCodeRepository } from '../ports/recovery-code-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { recoveryCodeSchema } from '../schemas/recovery-code';
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

/**
 * Verifies a plaintext recovery code against stored hashes (SOU-154).
 * Iterates all unconsumed hashes; on match marks the code consumed and
 * records an audit event. Throws {@link InvalidRecoveryCodeError} if no
 * match or no codes exist.
 */
export class VerifyRecoveryCode {
  constructor(
    private readonly codes: RecoveryCodeRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: VerifyRecoveryCodeInput): Promise<void> {
    const plain = recoveryCodeSchema.parse(input.recoveryCode);

    const unconsumed = await this.codes.findAllUnconsumed();
    if (unconsumed.length === 0) throw new NoRecoveryCodesError();

    for (const code of unconsumed) {
      if (await this.hasher.verify(code.codeHash, plain)) {
        await this.codes.consumeById(code.id);

        const now = this.clock.now();
        const event: AuthAuditEvent = {
          id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
          eventType: 'recovery-code-consumed',
          username: input.username,
          timestamp: now,
          metadata: {},
        };
        await this.auditLog.record(event);
        return;
      }
    }

    throw new InvalidRecoveryCodeError();
  }
}
