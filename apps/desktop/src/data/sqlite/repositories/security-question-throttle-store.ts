import type { Database as DB } from 'better-sqlite3';
import type { LockoutState, SecurityQuestionThrottleStore } from '@centresoutien/domain';

/** The singleton `security_question_lockout` row shape as SQLite returns it. */
type LockoutRow = {
  failed_attempts: number;
  locked_until: number | null; // epoch millis
};

/**
 * SQLite adapter for {@link SecurityQuestionThrottleStore}. Mirrors
 * `SqliteLoginThrottleStore` but reads/writes the separate
 * `security_question_lockout` row (id = 1) seeded by migration 0035, so the
 * SOU-155 reset path's 3-attempt counter never interferes with SOU-27's
 * 6-attempt login/recovery-code counter.
 */
export class SqliteSecurityQuestionThrottleStore implements SecurityQuestionThrottleStore {
  constructor(private readonly db: DB) {}

  async get(): Promise<LockoutState> {
    const row = this.db
      .prepare('SELECT failed_attempts, locked_until FROM security_question_lockout WHERE id = 1')
      .get() as LockoutRow | undefined;
    if (!row) return { failedAttempts: 0, lockedUntil: null };
    return {
      failedAttempts: row.failed_attempts,
      lockedUntil: row.locked_until,
    };
  }

  async save(state: LockoutState): Promise<void> {
    this.db
      .prepare(
        'UPDATE security_question_lockout SET failed_attempts = @attempts, locked_until = @until WHERE id = 1',
      )
      .run({
        attempts: state.failedAttempts,
        until: state.lockedUntil,
      });
  }

  async reset(): Promise<void> {
    await this.save({ failedAttempts: 0, lockedUntil: null });
  }
}
