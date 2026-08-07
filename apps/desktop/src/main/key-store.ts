import { randomBytes, hkdfSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { safeStorage } from 'electron';

/**
 * SOU-179 — per-center SQLCipher key derivation.
 *
 * One per-install master secret is wrapped by Electron `safeStorage` (OS
 * Keychain / Credential Manager / libsecret) and persisted under `userData`; a
 * per-center DB key is derived deterministically from it via HKDF-SHA256 over
 * `(master, centreId)`. A leaked DB key never compromises another center, and
 * the master never touches the disk unencrypted.
 *
 * The derived key is a 64-char hex passphrase — SQLCipher's passphrase-KDF
 * applies its own salt/iteration on top, so the key is never a raw key blob.
 */

/** Name of the key-store file inside `userData`. */
export const KEY_STORE_FILE_NAME = 'key-store.json';

/** SQLCipher passphrase used by every pre-SOU-179 build. Never a production key. */
export const LEGACY_DEV_DB_KEY = 'dev-insecure-key';

/**
 * Fixed key used by the dedicated E2E build (`--mode e2e`) when no `CS_DB_KEY`
 * is set, so specs never depend on the host's OS keychain. Dead-code-eliminated
 * from dev (uses the real keychain) and release (never reads it) builds.
 */
export const E2E_FIXED_DB_KEY = 'centre-soutien-e2e-test-key';

const KEY_STORE_VERSION = 1;
// HKDF salt + info are PERMANENT — every center DB key ever derived depends on
// them. Changing either orphans every existing DB with no migration path; bump
// only as part of a coordinated, tested re-key migration, never alone.
const HKDF_SALT = 'centre-soutien/db-key/v1';
const HKDF_INFO_PREFIX = 'centre-soutien/db-key/v1:';

/** Deterministic per-center key from the master secret (HKDF-SHA256, 32 bytes → hex). */
export function deriveCenterKey(masterSecret: Buffer, centreId: string): string {
  const material = Buffer.from(
    hkdfSync(
      'sha256',
      masterSecret,
      Buffer.from(HKDF_SALT, 'utf8'),
      Buffer.from(HKDF_INFO_PREFIX + centreId, 'utf8'),
      32,
    ),
  );
  return material.toString('hex');
}

export function newMasterSecret(): Buffer {
  return randomBytes(32);
}

/**
 * Where the wrapped master secret lives. The safeStorage-backed implementation
 * is an Electron main-process concern; tests inject a fake so KDF and
 * resolve-else-generate logic run under plain Node.
 */
export interface SecretVault {
  readonly available: boolean;
  /** The decrypted master secret, or `null` when none has been stored yet. */
  read(): Buffer | null;
  /** Encrypt and persist the master secret. */
  write(secret: Buffer): void;
}

/** The OS keychain is unavailable (headless Linux, restricted env), so no key
 *  material can be stored safely. The app must fail closed — never fall back to
 *  a predictable key in production. */
export class KeyStoreUnavailableError extends Error {
  constructor() {
    super('The OS keychain is unavailable, so the database key cannot be stored securely.');
    this.name = 'KeyStoreUnavailableError';
  }
}

/**
 * Resolve (generating and storing on first use) the key for `centreId`.
 * Deterministic for a given master + centreId, so every launch re-derives the
 * same key without persisting per-center key material.
 */
export function resolveCenterKey(vault: SecretVault, centreId: string): string {
  if (!vault.available) throw new KeyStoreUnavailableError();
  let master = vault.read();
  if (master === null) {
    master = newMasterSecret();
    vault.write(master);
  }
  return deriveCenterKey(master, centreId);
}

type KeyStoreFile = { v: number; secret: string };

/** safeStorage-wrapped master secret persisted as a versioned JSON file. */
export class SafeStorageSecretVault implements SecretVault {
  constructor(private readonly filePath: string) {}

  get available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  read(): Buffer | null {
    if (!existsSync(this.filePath)) return null;
    let parsed: KeyStoreFile;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as KeyStoreFile;
    } catch {
      // Truncated or non-JSON store — surface, never regenerate (regenerating
      // would orphan every center DB derived from the old master).
      throw new KeyStoreCorruptError(this.filePath);
    }
    if (parsed.v !== KEY_STORE_VERSION || typeof parsed.secret !== 'string') {
      throw new KeyStoreCorruptError(this.filePath);
    }
    const encrypted = Buffer.from(parsed.secret, 'base64');
    let decrypted: Buffer;
    try {
      decrypted = Buffer.from(safeStorage.decryptString(encrypted), 'base64');
    } catch {
      // The keychain entry is gone or undecryptable (OS reinstall, keychain
      // wiped or locked) — fail closed into the same startup dialog instead of
      // an unhandled rejection.
      throw new KeyStoreCorruptError(this.filePath);
    }
    return decrypted;
  }

  write(secret: Buffer): void {
    const encrypted = safeStorage.encryptString(secret.toString('base64'));
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload = JSON.stringify({ v: KEY_STORE_VERSION, secret: encrypted.toString('base64') } satisfies KeyStoreFile);
    // 0o600 at creation; enforce on write so an existing file with looser perms
    // (e.g. from a pre-0o600 version or a copy) is tightened back.
    writeFileSync(this.filePath, payload, { mode: 0o600 });
    chmodSync(this.filePath, 0o600);
  }
}

export class KeyStoreCorruptError extends Error {
  constructor(filePath: string) {
    super(`The key store at ${filePath} is unreadable, in an unknown format, or cannot be decrypted.`);
    this.name = 'KeyStoreCorruptError';
  }
}

/** Startup dialog copy for key-store / key-mismatch failures (FR + AR). */
export const DATABASE_KEY_MESSAGE = {
  fr: "Les données de ce centre n'ont pas pu être déverrouillées avec la clé de cette machine. Si vous avez restauré ces données depuis un autre ordinateur ou réinstallé le système, le compte de secours devra être reconstruit sur la machine d'origine.",
  ar: 'تعذّر فتح بيانات هذا المركز باستخدام مفتاح هذا الجهاز. إذا كنت قد استعدت هذه البيانات من جهاز آخر أو أعدت تثبيت النظام، فستحتاج إلى فتحها من الجهاز الأصلي.',
} as const;
