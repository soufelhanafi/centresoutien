import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import _sodium from 'libsodium-wrappers';
import { openDatabaseAt } from '../../src/data/sqlite/db';
import { LibsodiumRecoveryKeyEscrow } from '../../src/data/crypto/libsodium-recovery-key-escrow';
import { RecoveryKeyEscrowWriter, recoveryBlobPathFor } from '../../src/main/recovery-key-escrow-writer';
import * as recoveryPublicKeyModule from '../../src/main/recovery-public-key';

const DB_KEY = 'a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff';
const APP_DIR = join(import.meta.dirname, '../..');
const PRODUCT_PRIVATE_KEY_FILE = join(APP_DIR, '../../RECOVERY_PRIVATE_KEY.txt');

let sodium: typeof _sodium;
let escrow: LibsodiumRecoveryKeyEscrow;
let dir: string;

beforeEach(async () => {
  await _sodium.ready;
  sodium = _sodium;
  escrow = await LibsodiumRecoveryKeyEscrow.create();
  dir = mkdtempSync(join(tmpdir(), 'cs-recovery-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('LibsodiumRecoveryKeyEscrow round-trip', () => {
  it('unseals to the exact DB key with the matching private key', () => {
    const { publicKey, privateKey } = sodium.crypto_box_keypair();
    const sealed = escrow.sealDbKey(DB_KEY, publicKey);

    const recovered = sodium.crypto_box_seal_open(sealed, publicKey, privateKey, 'text');

    expect(recovered).toBe(DB_KEY);
  });

  it('produces a different blob each time (ephemeral sealed box) that still opens', () => {
    const { publicKey, privateKey } = sodium.crypto_box_keypair();

    const first = escrow.sealDbKey(DB_KEY, publicKey);
    const second = escrow.sealDbKey(DB_KEY, publicKey);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(false);
    expect(sodium.crypto_box_seal_open(first, publicKey, privateKey, 'text')).toBe(DB_KEY);
    expect(sodium.crypto_box_seal_open(second, publicKey, privateKey, 'text')).toBe(DB_KEY);
  });

  it('cannot be opened with a different private key', () => {
    const { publicKey } = sodium.crypto_box_keypair();
    const other = sodium.crypto_box_keypair();
    const sealed = escrow.sealDbKey(DB_KEY, publicKey);

    expect(() => sodium.crypto_box_seal_open(sealed, publicKey, other.privateKey, 'text')).toThrow();
  });
});

describe('nothing in the shipped binary can decrypt', () => {
  it('bakes a valid 32-byte X25519 public key and no private key', () => {
    const publicKey = recoveryPublicKeyModule.recoveryPublicKey();
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.length).toBe(sodium.crypto_box_PUBLICKEYBYTES);
  });

  it('exposes only a public key from the recovery-public-key module', () => {
    expect(Object.keys(recoveryPublicKeyModule)).toEqual(['recoveryPublicKey']);
    const source = readFileSync(join(APP_DIR, 'src/main/recovery-public-key.ts'), 'utf8');
    expect(source).not.toMatch(/privateKey|PRIVATE_KEY_BASE64|crypto_box_seal_open/i);
  });

  it('gives the escrow adapter a seal-only surface — never an unseal', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(escrow));
    expect(methods).toContain('sealDbKey');
    expect(methods).not.toContain('unseal');
    expect(methods).not.toContain('openDbKey');
    const source = readFileSync(join(APP_DIR, 'src/data/crypto/libsodium-recovery-key-escrow.ts'), 'utf8');
    expect(source).not.toContain('crypto_box_seal_open');
  });
});

describe('RecoveryKeyEscrowWriter', () => {
  it('writes the sealed blob as a sibling .recovery file that unseals to the DB key', () => {
    const { publicKey, privateKey } = sodium.crypto_box_keypair();
    const writer = new RecoveryKeyEscrowWriter(escrow, publicKey);
    const dbFilePath = join(dir, 'centre-C1.db');

    writer.writeSiblingFor(dbFilePath, DB_KEY);

    const blobPath = join(dir, 'centre-C1.recovery');
    expect(recoveryBlobPathFor(dbFilePath)).toBe(blobPath);
    const blob = new Uint8Array(readFileSync(blobPath));
    expect(sodium.crypto_box_seal_open(blob, publicKey, privateKey, 'text')).toBe(DB_KEY);
  });

  it('keeps one blob per center — distinct centers get distinct sibling files', () => {
    const { publicKey } = sodium.crypto_box_keypair();
    const writer = new RecoveryKeyEscrowWriter(escrow, publicKey);

    writer.writeSiblingFor(join(dir, 'centre-C1.db'), DB_KEY);
    writer.writeSiblingFor(join(dir, 'centre-C2.db'), 'ffffffffffffffffffffffffffffffff');

    expect(existsSync(join(dir, 'centre-C1.recovery'))).toBe(true);
    expect(existsSync(join(dir, 'centre-C2.recovery'))).toBe(true);
  });
});

// End-to-end proof of the exact production path: seal toward the baked PRODUCT
// public key at "provisioning", then recover through the CLI with the owner-held
// private key and open a real SQLCipher DB. Runs only where the untracked owner
// key is present (this worktree); CI without it skips rather than fails.
type CliResult = { status: number; stdout: string; stderr: string };

function runCli(cliArgs: readonly string[], env: NodeJS.ProcessEnv): CliResult {
  try {
    const stdout = execFileSync('node', ['scripts/recover-db-key.mjs', ...cliArgs], {
      cwd: APP_DIR,
      encoding: 'utf8',
      env,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('offline recovery CLI (production key path)', () => {
  const hasProductPrivateKey = existsSync(PRODUCT_PRIVATE_KEY_FILE);
  const productPrivateKey = () => readFileSync(PRODUCT_PRIVATE_KEY_FILE, 'utf8').trim();

  function sealSiblingFor(dbPath: string, dbKey: string): string {
    const writer = new RecoveryKeyEscrowWriter(escrow, recoveryPublicKeyModule.recoveryPublicKey());
    writer.writeSiblingFor(dbPath, dbKey);
    return recoveryBlobPathFor(dbPath);
  }

  it.skipIf(!hasProductPrivateKey)('recovers the DB key and opens the encrypted database', () => {
    const dbPath = join(dir, 'centre-CS-CASA-001.db');
    const seeded = openDatabaseAt(dbPath, DB_KEY);
    seeded.prepare('CREATE TABLE marker (v TEXT)').run();
    seeded.prepare('INSERT INTO marker (v) VALUES (?)').run('present');
    seeded.close();

    const blobPath = sealSiblingFor(dbPath, DB_KEY);
    const result = runCli(['--blob', blobPath, '--db', dbPath, '--print-key'], {
      ...process.env,
      CS_RECOVERY_PRIVATE_KEY: productPrivateKey(),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('schema object(s) readable');
    expect(result.stdout).toContain(`db key: ${DB_KEY}`);
  });

  it('exits 2 when no private key is supplied', () => {
    const dbPath = join(dir, 'centre-CS-CASA-001.db');
    const result = runCli(['--blob', join(dir, 'x.recovery'), '--db', dbPath], {
      ...process.env,
      CS_RECOVERY_PRIVATE_KEY: '',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('missing recovery private key');
  });

  it.skipIf(!hasProductPrivateKey)('exits 1 on a corrupt/garbage recovery blob', () => {
    const blobPath = join(dir, 'garbage.recovery');
    writeFileSync(blobPath, Buffer.from('this is not a sealed box'));

    const result = runCli(['--blob', blobPath, '--db', join(dir, 'centre-CS-CASA-001.db')], {
      ...process.env,
      CS_RECOVERY_PRIVATE_KEY: productPrivateKey(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not unseal the recovery blob');
  });

  it.skipIf(!hasProductPrivateKey)('exits 1 when the recovered key does not open the database', () => {
    const dbPath = join(dir, 'centre-CS-CASA-001.db');
    const seeded = openDatabaseAt(dbPath, DB_KEY);
    seeded.prepare('CREATE TABLE marker (v TEXT)').run();
    seeded.close();

    // Seal a DIFFERENT key than the one the DB was created with: the blob
    // unseals fine, but the recovered key cannot open the file.
    const wrongKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const blobPath = sealSiblingFor(dbPath, wrongKey);

    const result = runCli(['--blob', blobPath, '--db', dbPath], {
      ...process.env,
      CS_RECOVERY_PRIVATE_KEY: productPrivateKey(),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not open');
  });
});
