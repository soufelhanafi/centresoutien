import { describe, expect, it } from 'vitest';
import {
  KeyStoreUnavailableError,
  deriveCenterKey,
  newMasterSecret,
  resolveCenterKey,
  type SecretVault,
} from '../../src/main/key-store';

function fakeVault(initial: Buffer | null = null) {
  let stored = initial;
  const vault: SecretVault & { stored: () => Buffer | null } = {
    available: true,
    read: () => stored,
    write: (secret: Buffer) => {
      stored = Buffer.from(secret);
    },
    stored: () => stored,
  };
  return vault;
}

describe('deriveCenterKey', () => {
  it('is deterministic for the same master secret and centreId', () => {
    const master = newMasterSecret();
    expect(deriveCenterKey(master, 'C1')).toBe(deriveCenterKey(master, 'C1'));
  });

  it('returns a 64-char hex passphrase', () => {
    const key = deriveCenterKey(newMasterSecret(), 'C1');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives a different key per centreId from the same master', () => {
    const master = newMasterSecret();
    expect(deriveCenterKey(master, 'C1')).not.toBe(deriveCenterKey(master, 'C2'));
  });

  it('derives a different key per master secret', () => {
    expect(deriveCenterKey(newMasterSecret(), 'C1')).not.toBe(deriveCenterKey(newMasterSecret(), 'C1'));
  });
});

describe('resolveCenterKey', () => {
  it('generates and persists a master secret on first use', () => {
    const vault = fakeVault();
    const key = resolveCenterKey(vault, 'C1');
    expect(vault.stored()).not.toBeNull();
    expect(key).toBe(deriveCenterKey(vault.stored()!, 'C1'));
  });

  it('re-derives the same key without regenerating the master', () => {
    const vault = fakeVault();
    const first = resolveCenterKey(vault, 'C1');
    const stored = vault.stored();
    const second = resolveCenterKey(vault, 'C1');
    expect(second).toBe(first);
    expect(vault.stored()).toBe(stored);
  });

  it('uses an existing master secret as-is', () => {
    const master = newMasterSecret();
    const vault = fakeVault(master);
    expect(resolveCenterKey(vault, 'C1')).toBe(deriveCenterKey(master, 'C1'));
    expect(vault.stored()).toBe(master);
  });

  it('throws KeyStoreUnavailableError when the vault is unavailable', () => {
    const vault: SecretVault = { available: false, read: () => null, write: () => {} };
    expect(() => resolveCenterKey(vault, 'C1')).toThrow(KeyStoreUnavailableError);
  });

  it('keeps centers isolated — two centers never share a derived key', () => {
    const vault = fakeVault();
    expect(resolveCenterKey(vault, 'C1')).not.toBe(resolveCenterKey(vault, 'C2'));
  });
});
