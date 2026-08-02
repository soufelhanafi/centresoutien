import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import { DEFAULT_BACKUP_RETENTION_COUNT } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupConfigStore } from '../../src/data/sqlite/repositories/backup-config-store';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;
let store: SqliteBackupConfigStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-backup-cfg-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  store = new SqliteBackupConfigStore(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteBackupConfigStore', () => {
  it('defaults to no destination and the standard retention on a fresh center', async () => {
    expect(await store.get()).toEqual({
      destinationDir: null,
      retentionCount: DEFAULT_BACKUP_RETENTION_COUNT,
      lastBackupAt: null,
    });
  });

  it('persists the destination folder and retention count via app_meta', async () => {
    await store.save({ destinationDir: '/Volumes/USB', retentionCount: 14 });

    expect(await store.get()).toEqual({
      destinationDir: '/Volumes/USB',
      retentionCount: 14,
      lastBackupAt: null,
    });
    const rows = db.prepare("SELECT key FROM app_meta WHERE key LIKE 'backup_%'").all();
    expect(rows).toHaveLength(2);
  });

  it('overwrites a previously saved destination on a second save', async () => {
    await store.save({ destinationDir: '/Volumes/USB', retentionCount: 14 });
    await store.save({ destinationDir: '/home/admin/backups', retentionCount: 5 });

    expect(await store.get()).toMatchObject({ destinationDir: '/home/admin/backups', retentionCount: 5 });
  });

  it('records the last backup run timestamp', async () => {
    await store.recordBackupRun(new Date('2026-07-29T10:00:00Z'));
    expect((await store.get()).lastBackupAt).toEqual(new Date('2026-07-29T10:00:00Z'));
  });
});
