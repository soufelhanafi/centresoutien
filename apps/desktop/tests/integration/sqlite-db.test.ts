import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { openDatabase, centreDbFileName } from '../../src/data/sqlite/db';

const KEY = 'passphrase-under-test';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-db-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openDatabase (SQLCipher)', () => {
  it('names the file per center', () => {
    expect(centreDbFileName('CS-CASA-001')).toBe('centre-CS-CASA-001.db');
  });

  it('creates an encrypted DB that round-trips a row', () => {
    const db = openDatabase({ centreId: 'CS-CASA-001', key: KEY, dir });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, msg TEXT NOT NULL)');
    db.prepare('INSERT INTO t VALUES (?, ?)').run('1', 'bonjour');
    expect(db.prepare('SELECT msg FROM t WHERE id = ?').get('1')).toEqual({ msg: 'bonjour' });
    db.close();
  });

  it('enables WAL and foreign_keys', () => {
    const db = openDatabase({ centreId: 'CS-CASA-001', key: KEY, dir });
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('writes ciphertext to disk (no plaintext SQLite header)', () => {
    const db = openDatabase({ centreId: 'CS-CASA-001', key: KEY, dir });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.close();
    const header = readFileSync(join(dir, centreDbFileName('CS-CASA-001'))).subarray(0, 16).toString('latin1');
    expect(header.startsWith('SQLite format 3')).toBe(false);
  });

  it('cannot be opened without the key', () => {
    const db = openDatabase({ centreId: 'CS-CASA-001', key: KEY, dir });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.close();

    const noKey = new Database(join(dir, centreDbFileName('CS-CASA-001')));
    expect(() => noKey.prepare('SELECT count(*) FROM t').get()).toThrow(/NOTADB|file is not a database/i);
    noKey.close();
  });

  it('fails fast when opened with the wrong key', () => {
    const db = openDatabase({ centreId: 'CS-CASA-001', key: KEY, dir });
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    db.close();

    // The wrong key is rejected as soon as openDatabase touches the header.
    expect(() => openDatabase({ centreId: 'CS-CASA-001', key: 'not-the-key', dir })).toThrow(
      /NOTADB|file is not a database/i,
    );
  });
});
