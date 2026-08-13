import type { RecoveryCodeResetUnitOfWork } from '../../../src/ports/recovery-code-reset-unit-of-work';
import type { RecoveryCodeResetUnit } from '../../../src/ports/recovery-code-reset-unit-of-work';
import type { InMemoryAdminAccountRepository } from './in-memory-admin-account-repository';
import type { InMemoryRecoveryCodeRepository } from './in-memory-recovery-code-repository';
import type { InMemoryAuthAuditLogRepository } from './in-memory-auth-audit-log-repository';
import type { InMemoryDeviceSessionStore } from './in-memory-device-session-store';

/**
 * In-memory {@link RecoveryCodeResetUnitOfWork} for unit tests. Applies the whole
 * reset (password, code consume, device-session clear, audit rows) against the
 * same in-memory stores the test seeded, mirroring the SQLite adapter's single
 * `db.transaction`.
 *
 * When `failInsideCommit` is set it throws BEFORE applying ANY write — modeling
 * the transaction aborting and rolling back, so the use case leaves no partial
 * state (the SOU-169 guarantee). The all-or-nothing contract is exactly what
 * lets the test throw first: a real failure mid-transaction is indistinguishable
 * to callers from one before it, because neither leaves a partial write behind.
 */
export class InMemoryRecoveryCodeResetUnitOfWork implements RecoveryCodeResetUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case commits exactly once. */
  commits = 0;

  constructor(
    private readonly accounts: InMemoryAdminAccountRepository,
    private readonly codes: InMemoryRecoveryCodeRepository,
    private readonly auditLog: InMemoryAuthAuditLogRepository,
    private readonly deviceSessions: InMemoryDeviceSessionStore,
    private readonly failInsideCommit = false,
  ) {}

  async commit(unit: RecoveryCodeResetUnit): Promise<void> {
    this.commits += 1;
    if (this.failInsideCommit) {
      throw new Error('simulated failure inside the recovery-code reset transaction');
    }
    await this.accounts.save(unit.account);
    await this.codes.consumeById(unit.consumedCodeId, unit.consumedAt);
    if (unit.clearDeviceSession) await this.deviceSessions.clear();
    for (const event of unit.auditEvents) await this.auditLog.record(event);
  }
}
