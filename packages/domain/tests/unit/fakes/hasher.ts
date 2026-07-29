import type { PasswordHasher } from '../../../src/ports/password-hasher';

/**
 * Deterministic fake hasher for unit tests — no real Argon2 (that is covered by
 * an integration test on the concrete adapter). `hash` is a recognizable prefix
 * so tests can assert the plaintext was hashed and never stored verbatim.
 */
export function fakeHasher(): PasswordHasher {
  const encode = (plain: string) => `hashed:${plain}`;
  return {
    hash: async (plain) => encode(plain),
    verify: async (hash, plain) => hash === encode(plain),
  };
}
