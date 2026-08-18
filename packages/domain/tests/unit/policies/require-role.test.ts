import { describe, it, expect } from 'vitest';
import { requireRole } from '../../../src/policies/require-role';
import { InsufficientRoleError } from '../../../src/errors/authorization-errors';
import type { Role } from '../../../src/value-objects/role';

describe('requireRole', () => {
  it('passes when the actual role exactly meets the requirement', () => {
    expect(() => requireRole('admin', 'admin')).not.toThrow();
  });

  it('passes when the actual role outranks the requirement', () => {
    expect(() => requireRole('owner', 'admin')).not.toThrow();
  });

  it.each<Role>(['secretary', 'viewer'])(
    'throws InsufficientRoleError when %s ranks below admin',
    (role) => {
      expect(() => requireRole(role, 'admin')).toThrow(InsufficientRoleError);
    },
  );

  it('carries the required and actual roles on the error', () => {
    try {
      requireRole('secretary', 'admin');
      throw new Error('expected requireRole to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientRoleError);
      const insufficient = error as InsufficientRoleError;
      expect(insufficient.requiredRole).toBe('admin');
      expect(insufficient.actualRole).toBe('secretary');
      expect(insufficient.code).toBe('insufficient-role');
    }
  });
});
