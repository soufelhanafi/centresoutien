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
 * SOU-302: if the DB carries a `.recovery` escrow sibling, it wraps the OLD key,
 * so after a successful rekey the sibling is re-sealed toward the recovery public
 * key with the NEW key. Otherwise offline recovery would unseal a key that no
 * longer opens the DB. The sibling is re-sealed through the app's own escrow
 * adapter/writer (no hand-rolled crypto); loading those `.ts` modules needs
 * default type-stripping (Node >=22.18), so the script re-execs once under
 * `--experimental-strip-types` when it is not already active — mirroring
 * recover-db-key.mjs.
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
import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Re-exec once under --experimental-strip-types when this Node cannot yet strip
// TypeScript by default (< 22.18): the re-seal step below imports the app's `.ts`
// escrow modules so it reuses the exact sealing path instead of duplicating
// crypto. The child sees the flag active and skips this branch (no re-exec loop);
// env (incl. the keys) and args forward unchanged.
if (!process.features.typescript) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env },
  );
  process.exit(result.status ?? 1);
}

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

await reSealRecoverySibling(file, newKey);

console.log(`rekeyed ${file}`);

async function reSealRecoverySibling(dbFile, dbKey) {
  // Reuse the app's crypto (the escrow adapter + baked recovery public key) and
  // its single-sourced `.db` → `.recovery` path helper — never hand-rolled
  // crypto. The atomic temp+rename write mirrors RecoveryKeyEscrowWriter, which
  // this plain-Node script cannot import directly: that module's extensionless
  // relative import (app/bundler convention) does not resolve under bare Node.
  const { recoveryBlobPathFor } = await import('../src/data/sqlite/recovery-blob-path.ts');
  const target = recoveryBlobPathFor(dbFile);
  if (!existsSync(target)) return;
  try {
    const { LibsodiumRecoveryKeyEscrow } = await import('../src/data/crypto/libsodium-recovery-key-escrow.ts');
    const { recoveryPublicKey } = await import('../src/main/recovery-public-key.ts');
    const escrow = await LibsodiumRecoveryKeyEscrow.create();
    const sealed = escrow.sealDbKey(dbKey, recoveryPublicKey());
    const temp = `${target}.tmp`;
    writeFileSync(temp, sealed, { mode: 0o600 });
    renameSync(temp, target);
  } catch (error) {
    console.error(
      `rekeyed ${dbFile}, but re-sealing its recovery blob failed — it now wraps the OLD key and must be regenerated: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
