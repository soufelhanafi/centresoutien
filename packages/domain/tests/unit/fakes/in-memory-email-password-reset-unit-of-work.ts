import type {
  EmailPasswordResetUnitOfWork,
  EmailPasswordResetUnit,
} from '../../../src/ports/email-password-reset-unit-of-work';
import type { InMemoryAdminAccountRepository } from './in-memory-admin-account-repository';
import type { InMemoryAuthAuditLogRepository } from './in-memory-auth-audit-log-repository';
import type { InMemoryDeviceSessionStore } from './in-memory-device-session-store';

/**
 * In-memory {@link EmailPasswordResetUnitOfWork} for unit tests. Applies the whole
 * reset against the same in-memory stores the test seeded, mirroring the SQLite
 * adapter: the device-session clear plus its invalidation event are derived from
 * the live session — decided at commit time, not from a pre-read.
 *
 * When `failInsideCommit` is set it throws BEFORE applying any write, modeling the
 * transaction aborting and rolling back so the use case leaves no partial state.
 */
export class InMemoryEmailPasswordResetUnitOfWork implements EmailPasswordResetUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case commits exactly once. */
  commits = 0;

  constructor(
    private readonly accounts: InMemoryAdminAccountRepository,
    private readonly auditLog: InMemoryAuthAuditLogRepository,
    private readonly deviceSessions: InMemoryDeviceSessionStore,
    private readonly failInsideCommit = false,
  ) {}

  async commit(unit: EmailPasswordResetUnit): Promise<void> {
    this.commits += 1;
    if (this.failInsideCommit) {
      throw new Error('simulated failure inside the email password-reset transaction');
    }

    await this.accounts.save(unit.account);
    for (const event of unit.auditEvents) await this.auditLog.record(event);

    if ((await this.deviceSessions.getCurrent()) !== null) {
      await this.deviceSessions.clear();
      await this.auditLog.record(unit.deviceSessionInvalidatedEvent);
    }
  }
}
