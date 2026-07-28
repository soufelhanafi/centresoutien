import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { loadMigrations, runMigrations, backupDatabase } from '../../src/data/sqlite/migration-runner';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let migrations: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-mig-'));
  migrations = mkdtempSync(join(tmpdir(), 'cs-migfiles-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(migrations, { recursive: true, force: true });
});

function migfile(name: string, sql: string): void {
  writeFileSync(join(migrations, name), sql);
}

describe('loadMigrations', () => {
  it('reads numbered .sql files in order, ignoring non-migrations', () => {
    migfile('0002_b.sql', 'SELECT 1;');
    migfile('0001_a.sql', 'SELECT 1;');
    migfile('notes.md', '# ignore me');
    expect(loadMigrations(migrations).map((m) => m.version)).toEqual([1, 2]);
  });
});

describe('runMigrations', () => {
  it('applies pending migrations once and records them', () => {
    migfile('0001_a.sql', 'CREATE TABLE a (id TEXT PRIMARY KEY);');
    migfile('0002_b.sql', 'CREATE TABLE b (id TEXT PRIMARY KEY);');
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });

    expect(runMigrations(db, migrations, () => new Date('2026-07-28T00:00:00Z'))).toEqual([1, 2]);
    expect(db.prepare('SELECT version FROM _schema_migrations ORDER BY version').all()).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
    expect(() => db.prepare('SELECT * FROM a').all()).not.toThrow();
    db.close();
  });

  it('is idempotent — a second run applies nothing', () => {
    migfile('0001_a.sql', 'CREATE TABLE a (id TEXT PRIMARY KEY);');
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    expect(runMigrations(db, migrations)).toEqual([1]);
    expect(runMigrations(db, migrations)).toEqual([]);
    db.close();
  });

  it('rolls back a failing migration atomically', () => {
    migfile('0001_ok.sql', 'CREATE TABLE ok (id TEXT PRIMARY KEY);');
    migfile('0002_bad.sql', 'CREATE TABLE bad (id TEXT PRIMARY KEY); THIS IS NOT SQL;');
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });

    expect(() => runMigrations(db, migrations)).toThrow();
    expect(db.prepare('SELECT version FROM _schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bad'").all()).toEqual([]);
    db.close();
  });

  it('applies the real checked-in migrations and is idempotent', () => {
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    expect(runMigrations(db, REAL_MIGRATIONS).length).toBeGreaterThan(0);
    expect(runMigrations(db, REAL_MIGRATIONS)).toEqual([]);
    db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('schema', 'ok');
    expect(db.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema')).toEqual({ value: 'ok' });
    db.close();
  });
});

describe('backupDatabase', () => {
  it('produces an encrypted backup that reopens with the same key', () => {
    migfile('0001_a.sql', 'CREATE TABLE a (id TEXT PRIMARY KEY, msg TEXT NOT NULL);');
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    runMigrations(db, migrations);
    db.prepare('INSERT INTO a VALUES (?, ?)').run('1', 'hi');

    const dest = join(dir, 'centre-C1.db.bak');
    backupDatabase(db, dest);
    db.close();

    const header = readFileSync(dest).subarray(0, 16).toString('latin1');
    expect(header.startsWith('SQLite format 3')).toBe(false);

    const reopened = openDatabaseAt(dest, KEY);
    expect(reopened.prepare('SELECT msg FROM a WHERE id = ?').get('1')).toEqual({ msg: 'hi' });
    reopened.close();
  });
});
