import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { DeviceSession, DeviceSessionId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteDeviceSessionStore } from '../../src/data/sqlite/repositories/device-session-store';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let store: SqliteDeviceSessionStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-session-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  store = new SqliteDeviceSessionStore(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeSession(over: Partial<DeviceSession> = {}): DeviceSession {
  return {
    id: 'ses_00000000000000000000000001' as DeviceSessionId,
    createdAt: new Date('2026-07-29T10:00:00Z').getTime(),
    expiresAt: new Date('2026-08-28T10:00:00Z').getTime(),
    ...over,
  };
}

describe('SqliteDeviceSessionStore', () => {
  it('returns null from a freshly migrated DB (no remembered device)', async () => {
    expect(await store.getCurrent()).toBeNull();
  });

  it('round-trips a session through save + getCurrent', async () => {
    const session = makeSession();
    await store.save(session);
    expect(await store.getCurrent()).toEqual(session);
  });

  it('clear nulls the columns so getCurrent is null again — no row is deleted', async () => {
    await store.save(makeSession());
    await store.clear();
    expect(await store.getCurrent()).toBeNull();
    const rows = db.prepare('SELECT COUNT(*) AS n FROM device_sessions').get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it('replaces the previous session (single active session)', async () => {
    await store.save(makeSession());
    const next = makeSession({ id: 'ses_00000000000000000000000002' as DeviceSessionId });
    await store.save(next);
    expect((await store.getCurrent())?.id).toBe('ses_00000000000000000000000002');
  });

  it('rejects a session id without the ses_ prefix (CHECK)', async () => {
    await expect(
      store.save(makeSession({ id: 'bad_00000000000000000000000001' as DeviceSessionId })),
    ).rejects.toThrow();
  });
});
