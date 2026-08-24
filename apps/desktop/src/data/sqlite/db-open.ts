import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DB } from 'better-sqlite3';

/**
 * Cipher-critical open path, single-sourced so every caller keys a center DB
 * with byte-identical SQLCipher parameters. SOU-179 relies on SQLCipher's
 * defaults (no custom cipher/KDF pragma) and keys the file purely via
 * `PRAGMA key`; a caller that applied different cipher params would read a valid
 * DB as "not a database". This module has NO domain dependency on purpose, so it
 * can be reused from a plain Node context (the SOU-302 offline recovery CLI) that
 * cannot load the domain barrel — the CLI opens exactly as the app does instead
 * of hand-rolling PRAGMAs.
 */
export function openEncryptedDatabase(file: string, key: string): DB {
  const db = new Database(file);
  // PRAGMA does not support bound parameters; escape single quotes in the key.
  db.pragma(`key = '${key.replace(/'/g, "''")}'`);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Read-only, existing-file-only sibling of {@link openEncryptedDatabase}: it must
 * already exist (`fileMustExist: true`) and only `PRAGMA key` is applied — no WAL,
 * no `foreign_keys`. This is the probe the SOU-302 recovery CLI verifies a
 * recovered key with: a writable open would silently CREATE a new empty encrypted
 * DB for a mistyped `--db` path (whose `sqlite_master` count then "succeeds",
 * falsely reporting recovery) and would WAL-mutate a file that should only be
 * read. Mirrors `openDatabaseReadonlyAt` in db.ts. The cipher-critical `PRAGMA
 * key` escaping stays byte-identical to the writable path.
 */
export function openEncryptedDatabaseReadonly(file: string, key: string): DB {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma(`key = '${key.replace(/'/g, "''")}'`);
  return db;
}
