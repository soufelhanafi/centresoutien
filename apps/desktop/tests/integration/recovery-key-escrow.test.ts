import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
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
describe('offline recovery CLI (production key path)', () => {
  const hasProductPrivateKey = existsSync(PRODUCT_PRIVATE_KEY_FILE);

  it.skipIf(!hasProductPrivateKey)('recovers the DB key and opens the encrypted database', () => {
    const dbPath = join(dir, 'centre-CS-CASA-001.db');
    const seeded = openDatabaseAt(dbPath, DB_KEY);
    seeded.prepare('CREATE TABLE marker (v TEXT)').run();
    seeded.prepare('INSERT INTO marker (v) VALUES (?)').run('present');
    seeded.close();

    const writer = new RecoveryKeyEscrowWriter(escrow, recoveryPublicKeyModule.recoveryPublicKey());
    writer.writeSiblingFor(dbPath, DB_KEY);

    const output = execFileSync(
      'node',
      ['scripts/recover-db-key.mjs', '--blob', recoveryBlobPathFor(dbPath), '--db', dbPath, '--print-key'],
      {
        cwd: APP_DIR,
        encoding: 'utf8',
        env: { ...process.env, CS_RECOVERY_PRIVATE_KEY: readFileSync(PRODUCT_PRIVATE_KEY_FILE, 'utf8').trim() },
      },
    );

    expect(output).toContain('schema object(s) readable');
    expect(output).toContain(`db key: ${DB_KEY}`);
  });
});
