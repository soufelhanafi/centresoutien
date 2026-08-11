import { describe, expect, it } from 'vitest';
import { HashWasmPasswordHasher } from '../../../src/main/infra/hash-wasm-password-hasher';

const hasher = new HashWasmPasswordHasher();

describe('HashWasmPasswordHasher', () => {
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

  it('verifies a hash produced by the previous @node-rs/argon2 adapter (seamless migration)', async () => {
    const legacyNodeRsHash =
      '$argon2id$v=19$m=19456,t=2,p=1$MhHQ4Nv+kdqSNGJDRQXWwA$kByr1G+PbFgjPEyqcRrby0Zv78WnH6jBF5NzIG5d9cM';
    expect(await hasher.verify(legacyNodeRsHash, 'Casa2026!')).toBe(true);
    expect(await hasher.verify(legacyNodeRsHash, 'Wrong2026!')).toBe(false);
  });
});
