import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import type { PasswordHasher } from '@centresoutien/domain';

/**
 * Concrete {@link PasswordHasher} for the desktop main process, backed by
 * Argon2id via `hash-wasm` — a pure-WebAssembly implementation, so it ships no
 * platform-specific `.node` binary and needs no native rebuild, per-OS asar
 * unpacking, or Visual C++ runtime on the target machine (unlike the former
 * `@node-rs/argon2` adapter, which threw "Failed to load native binding" on
 * clean Windows installs — SOU-86). This adapter is the only place the plaintext
 * password is handled; the produced PHC string is all that ever reaches the DB.
 *
 * Parameters match the previous adapter exactly (OWASP Argon2id baseline:
 * ≈19 MiB, 2 iterations, 16-byte salt, 32-byte hash), so the emitted PHC string
 * is byte-compatible with hashes produced by the old native adapter — existing
 * stored hashes verify unchanged, no re-hashing required.
 */
const SALT_BYTES = 16;
const HASH_OPTIONS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
  outputType: 'encoded',
} as const;

export class HashWasmPasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2id({ password: plain, salt: randomBytes(SALT_BYTES), ...HASH_OPTIONS });
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await argon2Verify({ password: plain, hash: hashed });
    } catch {
      // A malformed/foreign hash string is a failed verification, not a crash.
      return false;
    }
  }
}
