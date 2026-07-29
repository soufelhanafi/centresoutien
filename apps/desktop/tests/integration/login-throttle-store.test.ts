import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteLoginThrottleStore } from '../../src/data/sqlite/repositories/login-throttle-store';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let store: SqliteLoginThrottleStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-lock-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  store = new SqliteLoginThrottleStore(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteLoginThrottleStore', () => {
  it('returns the unlocked default from a freshly migrated DB', async () => {
    expect(await store.get()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });

  it('round-trips a locked state through save + get', async () => {
    const until = new Date('2026-07-29T10:15:00Z');
    await store.save({ failedAttempts: 5, lockedUntil: until });
    expect(await store.get()).toEqual({ failedAttempts: 5, lockedUntil: until });
  });

  it('reset clears attempts and the lock', async () => {
    await store.save({ failedAttempts: 5, lockedUntil: new Date('2026-07-29T10:15:00Z') });
    await store.reset();
    expect(await store.get()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });

  it('stays a singleton — save always updates the same row', async () => {
    await store.save({ failedAttempts: 2, lockedUntil: null });
    await store.save({ failedAttempts: 3, lockedUntil: null });
    const rows = db.prepare('SELECT COUNT(*) AS n FROM auth_lockout').get() as { n: number };
    expect(rows.n).toBe(1);
    expect((await store.get()).failedAttempts).toBe(3);
  });
});
