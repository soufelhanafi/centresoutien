import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DB } from 'better-sqlite3';
import { DatabaseKeyMismatchError, ensureDatabaseKeyed, openDatabaseAt } from '../../src/data/sqlite/db';

const NEW_KEY = 'a'.repeat(64);
const LEGACY_KEY = 'dev-insecure-key';
const OTHER_KEY = 'b'.repeat(64);

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-key-'));
  file = join(dir, 'centre-test.db');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function createKeyedFile(key: string): void {
  const db = new Database(file);
  db.pragma(`key = '${key}'`);
  db.pragma('journal_mode = DELETE');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
  db.prepare('INSERT INTO t (v) VALUES (?)').run('keepme');
  db.close();
}

function opensWith(key: string): boolean {
  try {
    const db = new Database(file, { fileMustExist: true }) as unknown as DB;
    db.pragma(`key = '${key}'`);
    db.pragma('quick_check');
    db.close();
    return true;
  } catch {
    return false;
  }
}

describe('ensureDatabaseKeyed', () => {
  it('no-ops on a missing file (fresh install)', () => {
    expect(() => ensureDatabaseKeyed(file, NEW_KEY)).not.toThrow();
    expect(existsSync(file)).toBe(false);
  });

  it('leaves a DB already keyed with the new key untouched', () => {
    createKeyedFile(NEW_KEY);
    ensureDatabaseKeyed(file, NEW_KEY);
    expect(opensWith(NEW_KEY)).toBe(true);
  });

  it('re-keys a legacy-keyed DB in place without data loss', () => {
    createKeyedFile(LEGACY_KEY);
    ensureDatabaseKeyed(file, NEW_KEY, [LEGACY_KEY]);
    expect(opensWith(NEW_KEY)).toBe(true);
    expect(opensWith(LEGACY_KEY)).toBe(false);
    const db = openDatabaseAt(file, NEW_KEY);
    const row = db.prepare('SELECT v FROM t').get() as { v: string };
    expect(row.v).toBe('keepme');
    db.close();
  });

  it('re-keys via any matching entry in the legacy allowlist', () => {
    createKeyedFile(OTHER_KEY);
    ensureDatabaseKeyed(file, NEW_KEY, [LEGACY_KEY, OTHER_KEY]);
    expect(opensWith(NEW_KEY)).toBe(true);
    expect(opensWith(OTHER_KEY)).toBe(false);
  });

  it('throws DatabaseKeyMismatchError when no key opens the file', () => {
    createKeyedFile(OTHER_KEY);
    expect(() => ensureDatabaseKeyed(file, NEW_KEY)).toThrow(DatabaseKeyMismatchError);
  });

  it('throws DatabaseKeyMismatchError when the file is not a database', () => {
    // Corrupt the file header so no key can open it.
    writeFileSync(file, Buffer.from('not a sqlite database'));
    expect(() => ensureDatabaseKeyed(file, NEW_KEY, [LEGACY_KEY])).toThrow(DatabaseKeyMismatchError);
  });
});
