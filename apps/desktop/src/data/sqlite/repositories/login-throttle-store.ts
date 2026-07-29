import type { Database as DB } from 'better-sqlite3';
import type { LockoutState, LoginThrottleStore } from '@centresoutien/domain';

/** The singleton `auth_lockout` row shape as SQLite returns it. */
type LockoutRow = {
  failed_attempts: number;
  locked_until: string | null;
};

/**
 * SQLite adapter for {@link LoginThrottleStore}. The `auth_lockout` row (id = 1)
 * is seeded by migration 0004, so every operation is a read or an UPDATE of that
 * one row — no upsert, no delete. Pure translation between the port and SQL; the
 * 5-attempt / 15-minute decisions live in the domain policy.
 */
export class SqliteLoginThrottleStore implements LoginThrottleStore {
  constructor(private readonly db: DB) {}

  async get(): Promise<LockoutState> {
    const row = this.db
      .prepare('SELECT failed_attempts, locked_until FROM auth_lockout WHERE id = 1')
      .get() as LockoutRow | undefined;
    if (!row) return { failedAttempts: 0, lockedUntil: null };
    return {
      failedAttempts: row.failed_attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    };
  }

  async save(state: LockoutState): Promise<void> {
    this.db
      .prepare('UPDATE auth_lockout SET failed_attempts = @attempts, locked_until = @until WHERE id = 1')
      .run({
        attempts: state.failedAttempts,
        until: state.lockedUntil ? state.lockedUntil.toISOString() : null,
      });
  }

  async reset(): Promise<void> {
    await this.save({ failedAttempts: 0, lockedUntil: null });
  }
}
