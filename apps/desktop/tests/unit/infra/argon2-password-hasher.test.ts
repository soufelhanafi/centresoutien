import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../../src/main/infra/argon2-password-hasher';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher', () => {
  it('produces an Argon2id PHC hash that does not contain the plaintext', async () => {
    const hash = await hasher.hash('Casa2026!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Casa2026!');
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hasher.hash('Casa2026!');
    expect(await hasher.verify(hash, 'Casa2026!')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash('Casa2026!');
    expect(await hasher.verify(hash, 'Wrong2026!')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await hasher.verify('not-a-valid-argon2-hash', 'Casa2026!')).toBe(false);
  });

  it('uses a random salt: two hashes of the same password differ', async () => {
    const [a, b] = await Promise.all([hasher.hash('Casa2026!'), hasher.hash('Casa2026!')]);
    expect(a).not.toBe(b);
  });
});
