#!/usr/bin/env node
/**
 * SOU-302 — offline DB-key recovery.
 *
 * Recovers a center's SQLCipher DB key from the sealed `.recovery` blob that
 * travels next to its encrypted `.db` (and next to its backups). This is DB-key
 * recovery, NOT a password reset: given the sealed blob plus the owner-held
 * recovery PRIVATE key, it unwraps the exact DB key and proves it opens the DB.
 *
 * The blob was sealed toward the product recovery PUBLIC key with a libsodium
 * anonymous sealed box (`crypto_box_seal`); nothing in the shipped app can open
 * it. Only this CLI can, and only with a private key the operator supplies at
 * run time — never hard-coded, never shipped.
 *
 * SECURITY / RUNBOOK: `RECOVERY_PRIVATE_KEY.txt` (the owner-held private key)
 * must NEVER sit on a machine that runs `electron-builder` — .gitignore keeps it
 * out of git, but the packager will happily bundle any file under the app dir.
 * Keep the private key offline, on a machine that never builds a release.
 *
 * Requires the node-ABI build of the native module (same as rekey-db.mjs):
 *   pnpm rebuild:node
 *
 * Node: works on any supported Node (engines: >=22.12). It reuses the app's own
 * TypeScript open path (no hand-rolled PRAGMAs); Node <22.18 needs
 * `--experimental-strip-types` to import `.ts`, so the script re-execs itself
 * once with that flag when TypeScript support isn't already active.
 *
 * The private key is read from an env var or a file, never argv (`ps` exposes
 * argv to every user on the machine, and shell history records it):
 *   CS_RECOVERY_PRIVATE_KEY='<base64>' \
 *     node scripts/recover-db-key.mjs --blob centre-X.recovery --db centre-X.db
 *   # or
 *   node scripts/recover-db-key.mjs --blob centre-X.recovery --db centre-X.db \
 *     --key-file RECOVERY_PRIVATE_KEY.txt
 *
 * Add --print-key to also echo the recovered DB key (hex).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import _sodium from 'libsodium-wrappers';

// Re-exec once under --experimental-strip-types when this Node cannot yet strip
// TypeScript by default (< 22.18): the dynamic imports below load the app's `.ts`
// open path, and doing so keeps a single source of the SQLCipher parameters
// instead of duplicating PRAGMAs here. The child sees the flag active and skips
// this branch, so there is no re-exec loop; env (incl. the private key) and args
// are forwarded unchanged.
if (!process.features.typescript) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env },
  );
  process.exit(result.status ?? 1);
}

const { openEncryptedDatabaseReadonly } = await import('../src/data/sqlite/db-open.ts');
const { recoveryPublicKey } = await import('../src/main/recovery-public-key.ts');

function parseArgs(argv) {
  const args = { blob: undefined, db: undefined, keyFile: undefined, printKey: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--blob') args.blob = argv[(i += 1)];
    else if (flag === '--db') args.db = argv[(i += 1)];
    else if (flag === '--key-file') args.keyFile = argv[(i += 1)];
    else if (flag === '--print-key') args.printKey = true;
    else {
      console.error(`unknown argument: ${flag}`);
      process.exit(2);
    }
  }
  return args;
}

function readPrivateKeyBase64({ keyFile }) {
  const fromEnv = process.env.CS_RECOVERY_PRIVATE_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (keyFile) return readFileSync(keyFile, 'utf8').trim();
  return null;
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

const args = parseArgs(process.argv.slice(2));
if (!args.blob || !args.db) {
  console.error(
    'usage: [CS_RECOVERY_PRIVATE_KEY=<base64>] node scripts/recover-db-key.mjs --blob <file.recovery> --db <file.db> [--key-file <path>] [--print-key]',
  );
  process.exit(2);
}

const privateKeyBase64 = readPrivateKeyBase64(args);
if (!privateKeyBase64) {
  console.error('missing recovery private key: set CS_RECOVERY_PRIVATE_KEY or pass --key-file <path>');
  process.exit(2);
}

await _sodium.ready;
const sodium = _sodium;

let dbKey;
try {
  const sealedBlob = new Uint8Array(readFileSync(args.blob));
  const privateKey = sodium.from_base64(privateKeyBase64, sodium.base64_variants.ORIGINAL);
  dbKey = sodium.crypto_box_seal_open(sealedBlob, recoveryPublicKey(), privateKey, 'text');
} catch (error) {
  console.error(`could not unseal the recovery blob (wrong private key or corrupt blob): ${message(error)}`);
  process.exit(1);
}

let db;
try {
  db = openEncryptedDatabaseReadonly(args.db, dbKey);
  const { count } = db.prepare('SELECT count(*) AS count FROM sqlite_master').get();
  console.log(`recovered DB key opens ${args.db} — ${count} schema object(s) readable.`);
  if (args.printKey) console.log(`db key: ${dbKey}`);
} catch (error) {
  console.error(`recovered a key but it did not open ${args.db}: ${message(error)}`);
  process.exit(1);
} finally {
  db?.close();
}
