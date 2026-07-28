import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DB } from 'better-sqlite3';

/**
 * SQLCipher-encrypted database access — one file per center (CLAUDE.md §5quater,
 * loi 09-08). The key is applied via `PRAGMA key` before any I/O; the file is
 * unreadable without it.
 */
export type OpenOptions = {
  centreId: string;
  key: string;
  dir: string;
};

export function centreDbFileName(centreId: string): string {
  return `centre-${centreId}.db`;
}

/** Open (or create) an encrypted database at an explicit file path. */
export function openDatabaseAt(file: string, key: string): DB {
  const db = new Database(file);
  // PRAGMA does not support bound parameters; escape single quotes in the key.
  db.pragma(`key = '${key.replace(/'/g, "''")}'`);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Open (or create) the encrypted database for a given center. */
export function openDatabase({ centreId, key, dir }: OpenOptions): DB {
  return openDatabaseAt(join(dir, centreDbFileName(centreId)), key);
}
