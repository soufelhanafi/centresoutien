import type { RecoveryCodeRepository } from '../ports/recovery-code-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SecureRandom } from '../ports/secure-random';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import {
  RECOVERY_CODE_ID_PREFIX,
  type RecoveryCode,
  type RecoveryCodeId,
} from '../entities/recovery-code';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';

const CODE_COUNT = 16;
const BYTES_PER = 16;

function formatCode(hex: string): string {
  const upper = hex.toUpperCase();
  return `${upper.slice(0, 4)}-${upper.slice(4, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}`;
}

/**
 * Generates 16 XXXX-XXXX-XXXX-XXXX recovery codes (SOU-154). Each code is
 * Argon2id-hashed and stored; the plaintext codes are returned ONCE — only
 * the caller holds them after this call completes. A prior set is invalidated
 * if one exists. An audit event is recorded.
 */
export class GenerateRecoveryCodes {
  constructor(
    private readonly codes: RecoveryCodeRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(username: string): Promise<readonly string[]> {
    await this.codes.invalidateAll();

    const now = this.clock.now();
    const plainCodes: string[] = [];
    const hashedCodes: RecoveryCode[] = [];

    for (let i = 0; i < CODE_COUNT; i++) {
      const plain = formatCode(this.random.hex(BYTES_PER));
      plainCodes.push(plain);
      hashedCodes.push({
        id: this.ids.next(RECOVERY_CODE_ID_PREFIX) as RecoveryCodeId,
        codeHash: await this.hasher.hash(plain),
        consumed: false,
        createdAt: now,
        consumedAt: null,
      });
    }

    await this.codes.saveMany(hashedCodes);

    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'recovery-codes-generated',
      username,
      timestamp: now,
      metadata: { codeCount: CODE_COUNT },
    };
    await this.auditLog.record(event);

    return plainCodes;
  }
}
