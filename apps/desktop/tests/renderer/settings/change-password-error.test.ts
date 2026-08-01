import { describe, expect, it } from 'vitest';
import { mapChangePasswordError } from '../../../src/renderer/lib/settings/change-password-error';

describe('mapChangePasswordError', () => {
  it.each([
    ['InvalidCurrentPasswordError', 'invalid-current-password'],
    ['AdminAccountNotFoundError', 'admin-account-not-found'],
  ] as const)('maps %s to %s', (name, code) => {
    const error = new Error(`Error invoking remote method 'admin.changePassword': ${name}: boom`);
    expect(mapChangePasswordError(error)).toBe(code);
  });

  it('returns null for an unrelated failure', () => {
    expect(mapChangePasswordError(new Error('network down'))).toBeNull();
    expect(mapChangePasswordError('nope')).toBeNull();
  });

  it.each([
    'password-too-short',
    'password-too-long',
    'password-needs-lowercase',
    'password-needs-uppercase',
    'password-needs-digit',
  ] as const)('maps a ZodError carrying %s to that code', (code) => {
    const error = new Error(
      `Error invoking remote method 'admin.changePassword': ZodError: [{"code":"custom","message":"${code}","path":["newPassword"]}]`,
    );
    expect(mapChangePasswordError(error)).toBe(code);
  });
});
