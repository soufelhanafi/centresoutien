import type {
  SetupCodeRecoveryUnit,
  SetupCodeRecoveryUnitOfWork,
} from '../../../src/ports/setup-code-recovery-unit-of-work';
import type { InMemoryUserRepository } from './in-memory-user-repository';
import type { InMemoryAuthAuditLogRepository } from './in-memory-auth-audit-log-repository';
import type { InMemoryDeviceSessionStore } from './in-memory-device-session-store';

/**
 * In-memory {@link SetupCodeRecoveryUnitOfWork} for unit tests (SOU-303). Applies
 * the whole recovery against the same in-memory stores the test seeded, mirroring
 * the SQLite adapter: the password rotates via the setup-code compare-and-set (a
 * row still pending on `expectedSetupCodeHash`), and the device-session clear plus
 * its invalidation event are derived from the live session at commit time.
 *
 * When `failInsideCommit` is set it throws BEFORE applying any write, modeling the
 * transaction aborting and rolling back so the use case leaves no partial state.
 */
export class InMemorySetupCodeRecoveryUnitOfWork implements SetupCodeRecoveryUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case commits exactly once. */
  commits = 0;

  constructor(
    private readonly users: InMemoryUserRepository,
    private readonly auditLog: InMemoryAuthAuditLogRepository,
    private readonly deviceSessions: InMemoryDeviceSessionStore,
    private readonly failInsideCommit = false,
  ) {}

  async commit(unit: SetupCodeRecoveryUnit): Promise<void> {
    this.commits += 1;
    if (this.failInsideCommit) {
      throw new Error('simulated failure inside the setup-code recovery transaction');
    }

    const user = await this.users.findById(unit.id);
    if (
      user === null ||
      user.setupCodeHash !== unit.expectedSetupCodeHash ||
      user.setupCodeRedeemedAt !== null
    ) {
      throw unit.onCodeAlreadyRedeemed();
    }

    await this.users.save({
      ...user,
      passwordHash: unit.passwordHash,
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeRedeemedAt: unit.redeemedAt,
      updatedAt: unit.redeemedAt,
      updatedBy: unit.updatedBy,
    });

    for (const event of unit.auditEvents) await this.auditLog.record(event);

    if ((await this.deviceSessions.getCurrent()) !== null) {
      await this.deviceSessions.clear();
      await this.auditLog.record(unit.deviceSessionInvalidatedEvent);
    }
  }
}
