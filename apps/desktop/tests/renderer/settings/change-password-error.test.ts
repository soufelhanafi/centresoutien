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
});
