import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapCreateUserError } from '../../../src/renderer/lib/users/create-user-error';

describe('mapCreateUserError', () => {
  it.each([
    'username-already-taken',
    'invalid-user-role',
    'role-not-invitable',
    'insufficient-role',
    'not-authenticated',
  ] as const)('decodes %s from the rejection message (the real IPC path)', (code) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    const rejection = new Error(`Error invoking remote method 'user.create': Error: ${encoded}`);
    expect(mapCreateUserError(rejection)).toBe(code);
  });

  it.each(['insufficient-role', 'not-authenticated'] as const)(
    'reads a directly-attached %s code (in-process paths)',
    (code) => {
      expect(mapCreateUserError({ code })).toBe(code);
    },
  );

  it('returns null for an unrelated failure', () => {
    expect(mapCreateUserError(new Error('boom'))).toBeNull();
    expect(mapCreateUserError(undefined)).toBeNull();
  });
});
