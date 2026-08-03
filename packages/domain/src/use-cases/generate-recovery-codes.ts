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
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateCode(random: SecureRandom): string {
  const chars: string[] = [];
  let pool = random.bytes(32);
  let pos = 0;
  while (chars.length < 16) {
    if (pos >= pool.length) {
      pool = random.bytes(32);
      pos = 0;
    }
    const b = pool[pos++]!;
    if (b < 252) {
      chars.push(ALPHABET.charAt(b % ALPHABET.length));
    }
  }
  const code = chars.join('');
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}

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
    const now = this.clock.now();
    await this.codes.invalidateAll(now);

    const plainCodes: string[] = [];
    const hashedCodes: RecoveryCode[] = [];

    for (let i = 0; i < CODE_COUNT; i++) {
      const plain = generateCode(this.random);
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
