import type { AdminAccountRepository } from '../../../src/ports/admin-account-repository';
import type { AdminAccount, AdminAccountId } from '../../../src/entities/admin-account';

/**
 * In-memory {@link AdminAccountRepository} for unit tests. Keyed by id; `save`
 * clones so callers cannot mutate stored state. `all()` is a test-only helper.
 */
export class InMemoryAdminAccountRepository implements AdminAccountRepository {
  private readonly rows = new Map<AdminAccountId, AdminAccount>();

  async exists(): Promise<boolean> {
    return this.rows.size > 0;
  }

  async findByUsername(username: string): Promise<AdminAccount | null> {
    for (const account of this.rows.values()) {
      if (account.username === username) return structuredClone(account);
    }
    return null;
  }

  async findOnly(): Promise<AdminAccount | null> {
    const [first] = this.rows.values();
    return first ? structuredClone(first) : null;
  }

  async save(account: AdminAccount): Promise<void> {
    this.rows.set(account.id, structuredClone(account));
  }

  all(): readonly AdminAccount[] {
    return [...this.rows.values()];
  }
}
