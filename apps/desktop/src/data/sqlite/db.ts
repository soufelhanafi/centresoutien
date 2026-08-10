import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type { Database as DB } from 'better-sqlite3';
import { normalizeUsername, foldSearchText } from '@centresoutien/domain';

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
  // SQLite's built-in LOWER() is ASCII-only, so migrations that must backfill
  // a case-insensitive column (SOU-153) call this UDF instead — it wraps the
  // one domain-level normalizeUsername, so backfilled data and runtime
  // queries can never diverge on accented casing.
  db.function('normalize_username', { deterministic: true }, (username: unknown) =>
    normalizeUsername(String(username)),
  );
  // Diacritic-insensitive fold for name search (SOU-200). Wraps the one domain
  // foldSearchText so the folded query term and the folded column always match;
  // NULL passes through so an unsynced student row simply never matches.
  db.function('nfd_fold', { deterministic: true }, (text: unknown) =>
    text == null ? null : foldSearchText(String(text)),
  );
  return db;
}

/** Open (or create) the encrypted database for a given center. */
export function openDatabase({ centreId, key, dir }: OpenOptions): DB {
  return openDatabaseAt(join(dir, centreDbFileName(centreId)), key);
}

/**
 * The database could not be opened with its derived key, and none of the
 * explicitly allowed legacy keys opened it either. Either the file is corrupt
 * or it was encrypted with a key this machine no longer holds.
 */
export class DatabaseKeyMismatchError extends Error {
  constructor(file: string) {
    super(`The database at ${file} cannot be opened with this machine's key.`);
    this.name = 'DatabaseKeyMismatchError';
  }
}

/**
 * Make sure `file` can be opened with `key`, re-encrypting it in place
 * (`PRAGMA rekey`) when a DB created under a pre-SOU-179 dev key is detected.
 * `legacyKeys` is an explicit opt-in allowlist (never a silent fallback) — the
 * caller decides which old keys it trusts; a production startup passes none.
 *
 * A missing file is a fresh install: nothing to do — the next `openDatabase`
 * creates it already keyed. Key checks decrypt the first page (a wrong key
 * fails the earliest read); only the re-key path runs a full page walk.
 */
export function ensureDatabaseKeyed(file: string, key: string, legacyKeys: readonly string[] = []): void {
  if (!existsSync(file)) return;
  if (opensWith(file, key)) return;
  for (const legacy of legacyKeys) {
    if (!opensWith(file, legacy)) continue;
    rekeyDatabase(file, legacy, key);
    return;
  }
  throw new DatabaseKeyMismatchError(file);
}

function opensWith(file: string, key: string): boolean {
  let db: DB | null = null;
  try {
    db = new Database(file, { fileMustExist: true });
    db.pragma(`key = '${key.replace(/'/g, "''")}'`);
    // Decrypting the first page is enough to tell "wrong key" from "opens" —
    // the cheap per-launch probe; `rekeyDatabase` runs the full page walk.
    db.prepare('SELECT count(*) FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function rekeyDatabase(file: string, oldKey: string, newKey: string): void {
  let db: DB | null = null;
  try {
    db = new Database(file, { fileMustExist: true });
    db.pragma(`key = '${oldKey.replace(/'/g, "''")}'`);
    // `rekey` rewrites every page; force rollback journal first so a crash
    // mid-rekey cannot strand the file against an orphaned WAL. The pre-check
    // and the post-check both walk pages, so a wrong old key aborts before
    // anything is rewritten.
    db.pragma('quick_check');
    db.pragma('journal_mode = DELETE');
    db.pragma(`rekey = '${newKey.replace(/'/g, "''")}'`);
    db.pragma('quick_check');
  } finally {
    db?.close();
  }
}
