import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { CenterCode } from '@centresoutien/domain';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupAdapter } from '../../src/data/sqlite/repositories/backup-adapter';
import { UlidIdGenerator } from '../../src/main/infra/ulid-id-generator';

const KEY = 'passphrase-under-test';
const WRONG_KEY = 'a-deliberately-different-key';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;

let dir: string;
let destDir: string;
let db: DB;
let adapter: SqliteBackupAdapter;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-backup-adapter-'));
  destDir = join(dir, 'destination');
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('marker', 'original');
  adapter = new SqliteBackupAdapter(db, KEY, new UlidIdGenerator());
});
afterEach(() => {
  if (db.open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('SqliteBackupAdapter.create', () => {
  it('snapshots the live database into a fresh destination folder', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });

    expect(file.path).toBe(join(destDir, file.fileName));
    expect(file.fileName).toMatch(new RegExp(`^backup-${CENTER}_`));
    const reopened = openDatabaseAt(file.path, KEY);
    expect(reopened.prepare("SELECT value FROM app_meta WHERE key = 'marker'").get()).toEqual({
      value: 'original',
    });
    reopened.close();
  });
});

describe('SqliteBackupAdapter.list', () => {
  it('returns this center’s backups newest first and ignores unrelated files', async () => {
    const first = await adapter.create({ destDir, centerCode: CENTER });
    const second = await adapter.create({ destDir, centerCode: CENTER });
    writeFileSync(join(destDir, 'readme.txt'), 'not a backup');

    const listed = await adapter.list({ destDir, centerCode: CENTER });
    expect(listed.map((f) => f.fileName)).toEqual([second.fileName, first.fileName]);
  });

  it('returns an empty list when the destination folder does not exist yet', async () => {
    expect(await adapter.list({ destDir: join(dir, 'never-created'), centerCode: CENTER })).toEqual([]);
  });

  it('never mixes another center’s backups from the same shared folder', async () => {
    const OTHER = 'CS-RABAT-002' as CenterCode;
    await adapter.create({ destDir, centerCode: CENTER });
    await adapter.create({ destDir, centerCode: OTHER });

    const listed = await adapter.list({ destDir, centerCode: CENTER });
    expect(listed).toHaveLength(1);
  });
});

describe('SqliteBackupAdapter.remove', () => {
  it('deletes a backup file', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    await adapter.remove(file.path);
    expect(await adapter.list({ destDir, centerCode: CENTER })).toEqual([]);
  });

  it('is idempotent for an already-missing file', async () => {
    await expect(adapter.remove(join(destDir, 'never-existed.db'))).resolves.toBeUndefined();
  });
});

describe('SqliteBackupAdapter.verify', () => {
  it('reports ok for a valid backup opened with the right key', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    expect(await adapter.verify(file.path, KEY)).toEqual({ ok: true });
  });

  it('reports wrong-key for a valid backup opened with the wrong key', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    expect(await adapter.verify(file.path, WRONG_KEY)).toEqual({ ok: false, reason: 'wrong-key' });
  });

  it('reports not-found for a path that does not exist', async () => {
    expect(await adapter.verify(join(destDir, 'missing.db'), KEY)).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('reports corrupted for a truncated backup file', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    // Truncating (rather than flipping bytes, which may land on an unused/free
    // page and go unnoticed by `quick_check`) deterministically makes later
    // pages unreadable — SQLite/SQLCipher raises a distinct "disk image is
    // malformed" error, not the "wrong key" header-mismatch one.
    const bytes = readFileSync(file.path);
    writeFileSync(file.path, bytes.subarray(0, Math.floor(bytes.length * 0.5)));

    const result = await adapter.verify(file.path, KEY);
    expect(result).toEqual({ ok: false, reason: 'corrupted' });
  });

  it('never mutates the backup file it verifies', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    const before = readFileSync(file.path);
    await adapter.verify(file.path, KEY);
    expect(readFileSync(file.path)).toEqual(before);
    expect(readdirSync(destDir)).toEqual([file.fileName]);
  });
});

describe('SqliteBackupAdapter.restore', () => {
  it('swaps the live database for the backup and keeps a safety copy of the original', async () => {
    const file = await adapter.create({ destDir, centerCode: CENTER });
    const currentPath = db.name;

    db.prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('changed-after-backup', 'marker');

    await adapter.restore(file.path);

    expect(db.open).toBe(false); // restore closes the live handle
    const restored = openDatabaseAt(currentPath, KEY);
    expect(restored.prepare("SELECT value FROM app_meta WHERE key = 'marker'").get()).toEqual({
      value: 'original', // the backup's value, not the post-backup edit
    });
    restored.close();

    const safetyFiles = readdirSync(dir).filter((f) => f.includes('.pre-restore-'));
    expect(safetyFiles).toHaveLength(1);
    const safety = openDatabaseAt(join(dir, safetyFiles[0] as string), KEY);
    expect(safety.prepare("SELECT value FROM app_meta WHERE key = 'marker'").get()).toEqual({
      value: 'changed-after-backup', // the live file exactly as it was pre-restore
    });
    safety.close();
  });

  it('reclaims a safety copy left by an earlier restore, keeping at most one', async () => {
    const currentPath = db.name;
    const firstBackup = await adapter.create({ destDir, centerCode: CENTER });

    await adapter.restore(firstBackup.path);
    expect(readdirSync(dir).filter((f) => f.includes('.pre-restore-'))).toHaveLength(1);

    // Simulate the app relaunch a real restore requires: a fresh connection,
    // a fresh adapter, against the just-restored file.
    const reopened = openDatabaseAt(currentPath, KEY);
    const secondAdapter = new SqliteBackupAdapter(reopened, KEY, new UlidIdGenerator());
    const secondBackup = await secondAdapter.create({ destDir, centerCode: CENTER });

    await secondAdapter.restore(secondBackup.path);

    // Exactly one remains — the first restore's safety copy was reclaimed
    // before the second restore created its own.
    expect(readdirSync(dir).filter((f) => f.includes('.pre-restore-'))).toHaveLength(1);
  });

  it('never destroys the live database when the swap fails', async () => {
    const currentPath = db.name;
    const brokenPath = join(dir, 'a-directory-not-a-file');
    mkdirSync(brokenPath);

    await expect(adapter.restore(brokenPath)).rejects.toThrow();

    // Rolled back: no leftover safety file, and the original data is intact.
    expect(readdirSync(dir).some((f) => f.includes('.pre-restore-'))).toBe(false);
    const reopened = openDatabaseAt(currentPath, KEY);
    expect(reopened.prepare("SELECT value FROM app_meta WHERE key = 'marker'").get()).toEqual({
      value: 'original',
    });
    reopened.close();
  });
});
