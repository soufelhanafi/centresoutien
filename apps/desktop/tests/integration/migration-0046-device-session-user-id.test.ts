import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { DeviceSessionId, UserId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { applyMigrations, loadMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteDeviceSessionStore } from '../../src/data/sqlite/repositories/device-session-store';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-session-userid-migrate-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Apply every migration strictly before the 0046 user-id migration. */
function migrateToBefore0046() {
  const migrations = loadMigrations(REAL_MIGRATIONS);
  const userIdMigration = migrations.find((m) => m.name.includes('device_session_user_id'));
  if (!userIdMigration) throw new Error('0046_device_session_user_id migration not found');
  applyMigrations(
    db,
    migrations.filter((m) => m.version < userIdMigration.version),
  );
  return userIdMigration;
}

describe('migration 0046 device_sessions.user_id', () => {
  it('adds user_id, preserving an existing remembered session as an unknown principal', async () => {
    const userIdMigration = migrateToBefore0046();

    // A device remembered on the OLD schema: no user_id column yet.
    db.prepare(
      `UPDATE device_sessions
         SET session_id = @id, created_at = @createdAt, expires_at = @expiresAt
       WHERE id = 1`,
    ).run({
      id: 'ses_00000000000000000000000001',
      createdAt: new Date('2026-07-29T10:00:00Z').getTime(),
      expiresAt: new Date('2026-08-28T10:00:00Z').getTime(),
    });

    applyMigrations(db, [userIdMigration]);

    // The remembered session survives the upgrade (never wiped) and its user_id
    // reads back NULL — the caller degrades it to an unknown principal.
    const store = new SqliteDeviceSessionStore(db);
    expect(await store.getCurrent()).toEqual({
      id: 'ses_00000000000000000000000001',
      createdAt: new Date('2026-07-29T10:00:00Z').getTime(),
      expiresAt: new Date('2026-08-28T10:00:00Z').getTime(),
      userId: null,
    });
  });

  it('lets a fresh save persist and read back the user id after upgrade', async () => {
    const userIdMigration = migrateToBefore0046();
    applyMigrations(db, [userIdMigration]);

    const store = new SqliteDeviceSessionStore(db);
    await store.save({
      id: 'ses_00000000000000000000000002' as DeviceSessionId,
      createdAt: new Date('2026-07-29T10:00:00Z').getTime(),
      expiresAt: new Date('2026-08-28T10:00:00Z').getTime(),
      userId: 'usr_00000000000000000000000009' as UserId,
    });

    expect((await store.getCurrent())?.userId).toBe('usr_00000000000000000000000009');
  });

  it('is idempotent-safe to replay the full chain from scratch (column exists once)', async () => {
    applyMigrations(db, loadMigrations(REAL_MIGRATIONS));
    const columns = db.prepare('PRAGMA table_info(device_sessions)').all() as { name: string }[];
    expect(columns.filter((c) => c.name === 'user_id')).toHaveLength(1);
  });
});
