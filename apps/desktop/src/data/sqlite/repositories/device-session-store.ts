import type { Database as DB } from 'better-sqlite3';
import type { DeviceSession, DeviceSessionId, DeviceSessionStore } from '@centresoutien/domain';

/** The singleton `device_sessions` row shape as SQLite returns it. */
type DeviceSessionRow = {
  session_id: string | null;
  created_at: number | null; // epoch millis
  expires_at: number | null; // epoch millis
};

/**
 * SQLite adapter for {@link DeviceSessionStore}. The `device_sessions` row
 * (id = 1) is seeded by migration 0004; "no active session" is a NULL
 * `session_id`, not a missing row — so `clear` nulls the columns rather than
 * deleting (this is device-local infra, but keeping it delete-free matches the
 * repo's no-hard-delete grain). Expiry is never decided here; the domain does
 * that with the Clock.
 */
export class SqliteDeviceSessionStore implements DeviceSessionStore {
  constructor(private readonly db: DB) {}

  async save(session: DeviceSession): Promise<void> {
    this.db
      .prepare(
        `UPDATE device_sessions
           SET session_id = @id, created_at = @createdAt, expires_at = @expiresAt
         WHERE id = 1`,
      )
      .run({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
  }

  async getCurrent(): Promise<DeviceSession | null> {
    const row = this.db
      .prepare('SELECT session_id, created_at, expires_at FROM device_sessions WHERE id = 1')
      .get() as DeviceSessionRow | undefined;
    if (!row || row.session_id === null || row.created_at === null || row.expires_at === null) {
      return null;
    }
    return {
      id: row.session_id as DeviceSessionId,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  async clear(): Promise<void> {
    this.db
      .prepare(
        'UPDATE device_sessions SET session_id = NULL, created_at = NULL, expires_at = NULL WHERE id = 1',
      )
      .run();
  }
}
