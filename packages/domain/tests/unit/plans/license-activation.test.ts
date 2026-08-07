import { describe, expect, it } from 'vitest';
import type { LicenseClaims } from '../../../src/plans/license';
import {
  evaluateLicenseBinding,
  isFounderDiscountExpired,
  type LicenseBindingContext,
} from '../../../src/plans/license-activation';

const NOW = new Date('2026-08-06T00:00:00.000Z');
const CONTEXT: LicenseBindingContext = { machineId: 'machine-A', centerCode: 'CS-CASA-001' };

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    plan: 'premium',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    machineId: null,
    centerCode: null,
    centersAllowed: null,
    founderDiscountExpiresAt: null,
    demo: false,
    ...overrides,
  };
}

describe('evaluateLicenseBinding', () => {
  const cases = [
    { name: 'unbound perpetual license binds cleanly', c: {}, expected: null },
    {
      name: 'machine + center match, unexpired → clean',
      c: { machineId: 'machine-A', centerCode: 'CS-CASA-001', expiresAt: '2099-01-01T00:00:00.000Z' },
      expected: null,
    },
    { name: 'machine mismatch → wrong-machine', c: { machineId: 'machine-B' }, expected: 'wrong-machine' },
    {
      name: 'center mismatch → wrong-center',
      c: { centerCode: 'CS-RABAT-002' },
      expected: 'wrong-center',
    },
    {
      name: 'past expiry on a matching license → expired',
      c: { machineId: 'machine-A', expiresAt: '2000-01-01T00:00:00.000Z' },
      expected: 'expired',
    },
    {
      name: 'machine mismatch wins over expiry (identity checked first)',
      c: { machineId: 'machine-B', expiresAt: '2000-01-01T00:00:00.000Z' },
      expected: 'wrong-machine',
    },
  ] as const;

  it.each(cases)('$name', ({ c, expected }) => {
    expect(evaluateLicenseBinding(claims(c), CONTEXT, NOW)).toBe(expected);
  });
});

describe('evaluateLicenseBinding — demo licenses (SOU-110)', () => {
  const demoContext: LicenseBindingContext = { machineId: 'machine-A', centerCode: 'CS-DEMO-001' };
  const demo = (overrides: Partial<LicenseClaims> = {}): LicenseClaims =>
    claims({ centerCode: 'CS-DEMO-001', demo: true, ...overrides });

  it('skips the machine check for a demo license on any machine', () => {
    // A demo license carrying a stale machineId (or none) still binds on a
    // different laptop — the machine check is deliberately a no-op.
    expect(evaluateLicenseBinding(demo({ machineId: 'sales-laptop-1' }), demoContext, NOW)).toBeNull();
  });

  it('still enforces the center binding — a demo license never leaks to a real center', () => {
    expect(
      evaluateLicenseBinding(demo({}), { machineId: 'any', centerCode: 'CS-CASA-001' }, NOW),
    ).toBe('wrong-center');
  });

  it('still enforces expiry on a demo license', () => {
    expect(evaluateLicenseBinding(demo({ expiresAt: '2000-01-01T00:00:00.000Z' }), demoContext, NOW)).toBe(
      'expired',
    );
  });

  it('keeps the machine check for a non-demo license', () => {
    expect(evaluateLicenseBinding(claims({ machineId: 'machine-B' }), demoContext, NOW)).toBe('wrong-machine');
  });
});

describe('isFounderDiscountExpired', () => {
  it('no founder discount (null) is never expired', () => {
    expect(isFounderDiscountExpired(claims({ founderDiscountExpiresAt: null }), NOW)).toBe(false);
  });

  it('future founder-discount expiry is not expired', () => {
    expect(
      isFounderDiscountExpired(claims({ founderDiscountExpiresAt: '2099-01-01T00:00:00.000Z' }), NOW),
    ).toBe(false);
  });

  it('past founder-discount expiry is expired', () => {
    expect(
      isFounderDiscountExpired(claims({ founderDiscountExpiresAt: '2026-08-05T00:00:00.000Z' }), NOW),
    ).toBe(true);
  });

  it('an unparsable founder-discount expiry fails closed (treated as expired)', () => {
    expect(isFounderDiscountExpired(claims({ founderDiscountExpiresAt: 'not-a-date' }), NOW)).toBe(true);
  });
});
