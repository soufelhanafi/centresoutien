import { describe, it, expect } from 'vitest';
import { redactConflictEntity } from '../../../src/main/ipc/sync-handlers';

// SOU-252 (Qodo High): a `users` sync conflict must never carry credential hashes
// across IPC to the renderer, where the conflict card could stringify them. The
// main-process projection strips them before they leave.
describe('redactConflictEntity', () => {
  it('strips passwordHash and setupCodeHash from a users conflict entity', () => {
    const user = {
      id: 'usr_00000000000000000000000001',
      username: 'amine',
      role: 'secretary',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
      setupCodeHash: '$argon2id$v=19$m=19456,t=2,p=1$code$hash',
      setupCodeExpiresAt: 1_760_000_000_000,
    };

    const redacted = redactConflictEntity('users', user);

    expect(redacted).not.toHaveProperty('passwordHash');
    expect(redacted).not.toHaveProperty('setupCodeHash');
    // Non-secret fields the renderer needs to show the diff survive.
    expect(redacted).toMatchObject({ username: 'amine', role: 'secretary' });
    expect(JSON.stringify(redacted)).not.toContain('argon2id');
    // The source object is not mutated (a copy is returned).
    expect(user.passwordHash).toBe('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
  });

  it('leaves a non-users entity untouched (nothing to redact)', () => {
    const subject = { id: 'sub_1', name: { fr: 'Maths', ar: 'رياضيات' }, code: 'MATH' };
    expect(redactConflictEntity('subjects', subject)).toEqual(subject);
  });
});
