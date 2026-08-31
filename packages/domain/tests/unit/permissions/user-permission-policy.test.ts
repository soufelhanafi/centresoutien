import { describe, it, expect } from 'vitest';
import { hasUserPermission, requireUserPermission } from '../../../src/permissions/user-permission-policy';
import { UserPermissionDeniedError } from '../../../src/errors/user-errors';
import type { PermissionSubject } from '../../../src/permissions/user-permission-policy';

function subject(overrides: Partial<PermissionSubject> = {}): PermissionSubject {
  return { role: 'secretary', permissions: new Set(), ...overrides };
}

describe('hasUserPermission / requireUserPermission', () => {
  it('grants owner every flag regardless of stored permissions', () => {
    expect(hasUserPermission(subject({ role: 'owner', permissions: new Set() }), 'nav.payroll')).toBe(
      true,
    );
    expect(() =>
      requireUserPermission(subject({ role: 'owner', permissions: new Set() }), 'settings.sensitive'),
    ).not.toThrow();
  });

  it('grants a non-owner only the flags explicitly stored', () => {
    const secretary = subject({ permissions: new Set(['nav.payments']) });
    expect(hasUserPermission(secretary, 'nav.payments')).toBe(true);
    expect(hasUserPermission(secretary, 'nav.payroll')).toBe(false);
  });

  it('require throws UserPermissionDeniedError naming the missing flag', () => {
    const secretary = subject({ permissions: new Set() });
    expect(() => requireUserPermission(secretary, 'nav.payroll')).toThrow(UserPermissionDeniedError);
    try {
      requireUserPermission(secretary, 'nav.payroll');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UserPermissionDeniedError);
      expect((error as UserPermissionDeniedError).permission).toBe('nav.payroll');
    }
  });
});
