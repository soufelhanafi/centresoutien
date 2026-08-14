import { describe, it, expect } from 'vitest';
import { ROLES, isRole, roleRank, isRoleSufficient, type Role } from '../../../src/value-objects/role';

describe('Role', () => {
  it('is the strict hierarchy owner > admin > secretary > viewer', () => {
    expect([...ROLES]).toEqual(['owner', 'admin', 'secretary', 'viewer']);
  });

  it.each(ROLES)('accepts the known token %s', (token) => {
    expect(isRole(token)).toBe(true);
  });

  it.each(['Owner', 'root', 'guest', '', ' admin '])('rejects the unknown token %j', (token) => {
    expect(isRole(token)).toBe(false);
  });

  describe('roleRank', () => {
    it('ranks owner highest and viewer lowest, strictly descending', () => {
      expect(roleRank('owner')).toBeGreaterThan(roleRank('admin'));
      expect(roleRank('admin')).toBeGreaterThan(roleRank('secretary'));
      expect(roleRank('secretary')).toBeGreaterThan(roleRank('viewer'));
    });
  });

  describe('isRoleSufficient', () => {
    it('every role satisfies itself', () => {
      for (const role of ROLES) {
        expect(isRoleSufficient(role, role)).toBe(true);
      }
    });

    it('owner satisfies every required role', () => {
      for (const required of ROLES) {
        expect(isRoleSufficient('owner', required)).toBe(true);
      }
    });

    it('viewer satisfies only viewer', () => {
      for (const required of ROLES) {
        expect(isRoleSufficient('viewer', required)).toBe(required === 'viewer');
      }
    });

    const cases: ReadonlyArray<{ actual: Role; required: Role; sufficient: boolean }> = [
      { actual: 'owner', required: 'owner', sufficient: true },
      { actual: 'owner', required: 'admin', sufficient: true },
      { actual: 'owner', required: 'secretary', sufficient: true },
      { actual: 'owner', required: 'viewer', sufficient: true },
      { actual: 'admin', required: 'owner', sufficient: false },
      { actual: 'admin', required: 'admin', sufficient: true },
      { actual: 'admin', required: 'secretary', sufficient: true },
      { actual: 'admin', required: 'viewer', sufficient: true },
      { actual: 'secretary', required: 'owner', sufficient: false },
      { actual: 'secretary', required: 'admin', sufficient: false },
      { actual: 'secretary', required: 'secretary', sufficient: true },
      { actual: 'secretary', required: 'viewer', sufficient: true },
      { actual: 'viewer', required: 'owner', sufficient: false },
      { actual: 'viewer', required: 'admin', sufficient: false },
      { actual: 'viewer', required: 'secretary', sufficient: false },
      { actual: 'viewer', required: 'viewer', sufficient: true },
    ];

    it.each(cases)(
      '$actual vs required $required -> $sufficient',
      ({ actual, required, sufficient }) => {
        expect(isRoleSufficient(actual, required)).toBe(sufficient);
      },
    );
  });
});
