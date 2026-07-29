import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';
import type { PasswordHasher } from '@centresoutien/domain';

// `Algorithm` is an ambient const enum; `verbatimModuleSyntax` forbids importing
// it as a value, so we spell the Argon2id member (2) as a typed literal.
const ARGON2ID = 2 as Algorithm;

/**
 * Concrete {@link PasswordHasher} for the desktop main process, backed by
 * Argon2id (`@node-rs/argon2` — prebuilt Node-API binaries, so it needs no
 * per-ABI native rebuild). This adapter is the only place the plaintext password
 * is handled; the produced PHC string is all that ever reaches the DB (SOU-26).
 *
 * Cost parameters follow the OWASP Argon2id baseline (≈19 MiB, 2 iterations).
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain, OPTIONS);
    } catch {
      // A malformed/foreign hash string is a failed verification, not a crash.
      return false;
    }
  }
}
