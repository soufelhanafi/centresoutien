import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '@centresoutien/domain';

/**
 * Concrete {@link PasswordHasher} for the desktop main process, backed by
 * Argon2id (`@node-rs/argon2` — prebuilt Node-API binaries, so it needs no
 * per-ABI native rebuild). This adapter is the only place the plaintext password
 * is handled; the produced PHC string is all that ever reaches the DB (SOU-26).
 *
 * Cost parameters follow the OWASP Argon2id baseline (≈19 MiB, 2 iterations).
 */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
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
