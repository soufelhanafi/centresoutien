#!/usr/bin/env node
/**
 * SOU-179 — manual re-key of a center DB.
 *
 * Re-encrypts an existing SQLCipher DB in place (`PRAGMA rekey`) from one key
 * to another. Intended for databases still under the pre-SOU-179 dev key, or a
 * deliberately chosen new passphrase. Refuses to touch a file that does not
 * open with the supplied old key (wrong key and corruption are indistinguishable
 * to SQLCipher before a page walk, so a failed `quick_check` aborts).
 *
 * Requires the node-ABI build of the native module:
 *   pnpm rebuild:node
 *
 * Keys are read from environment variables (never argv — `ps` exposes argv to
 * every user on the machine, and shell history records it):
 *   CS_REKEY_OLD_KEY='…' CS_REKEY_NEW_KEY='…' pnpm db:rekey <file.db>
 *
 * No data is deleted: `rekey` rewrites the file in place, and the caller keeps
 * a separate backup if one is wanted.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3-multiple-ciphers');

const [file] = process.argv.slice(2);
const oldKey = process.env.CS_REKEY_OLD_KEY;
const newKey = process.env.CS_REKEY_NEW_KEY;
if (!file || !oldKey || !newKey) {
  console.error('usage: CS_REKEY_OLD_KEY=… CS_REKEY_NEW_KEY=… node scripts/rekey-db.mjs <file.db>');
  process.exit(2);
}

const escape = (value) => value.replace(/'/g, "''");

let db;
try {
  db = new Database(file, { fileMustExist: true });
  db.pragma(`key = '${escape(oldKey)}'`);
  db.pragma('quick_check');
  // Rollback journal first so a crash mid-rekey cannot strand the file against
  // an orphaned WAL (mirrors ensureDatabaseKeyed in the data layer).
  db.pragma('journal_mode = DELETE');
  db.pragma(`rekey = '${escape(newKey)}'`);
  db.pragma('quick_check');
} catch (error) {
  console.error(`re-key failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  db?.close();
}

console.log(`rekeyed ${file}`);
