import { describe, expect, it } from 'vitest';
import { PLANS } from '../../../src/plans/plans';
import type { LicenseClaims, LicenseVerification } from '../../../src/plans/license';
import {
  isLicenseExpired,
  resolveActivePlan,
} from '../../../src/plans/resolve-active-plan';
import {
  LicenseExpiredError,
  LicenseMissingError,
  LicenseSignatureInvalidError,
  LicenseWrongCenterError,
  LicenseWrongMachineError,
} from '../../../src/errors/license-errors';

const NOW = new Date('2026-08-06T00:00:00.000Z');

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

const valid = (c: LicenseClaims): LicenseVerification => ({ status: 'valid', claims: c });

describe('resolveActivePlan — license present (valid signature)', () => {
  it('resolves the licensed tier when unexpired (perpetual)', () => {
    const res = resolveActivePlan(valid(claims({ plan: 'premium' })), NOW);
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.premium);
    expect(res.error).toBeNull();
    expect(res.claims?.plan).toBe('premium');
  });

  it('resolves the licensed tier when expiry is in the future', () => {
    const res = resolveActivePlan(
      valid(claims({ plan: 'pro', expiresAt: '2027-01-01T00:00:00.000Z' })),
      NOW,
    );
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.pro);
  });
});

describe('resolveActivePlan — expired (valid signature, past expiry)', () => {
  it('falls back to essentiel and reports LicenseExpiredError', () => {
    const res = resolveActivePlan(
      valid(claims({ plan: 'premium', expiresAt: '2026-08-05T23:59:59.000Z' })),
      NOW,
    );
    expect(res.status).toBe('expired');
    expect(res.plan).toBe(PLANS.essentiel);
    expect(res.error).toBeInstanceOf(LicenseExpiredError);
    expect((res.error as LicenseExpiredError).expiresAt).toBe('2026-08-05T23:59:59.000Z');
    // claims survive so SOU-104 can show which tier lapsed.
    expect(res.claims?.plan).toBe('premium');
  });

  it('treats expiry exactly at "now" as expired (boundary is inclusive)', () => {
    const res = resolveActivePlan(
      valid(claims({ expiresAt: NOW.toISOString() })),
      NOW,
    );
    expect(res.status).toBe('expired');
    expect(res.plan).toBe(PLANS.essentiel);
  });
});

describe('resolveActivePlan — no usable license', () => {
  it('missing file → essentiel + LicenseMissingError', () => {
    const res = resolveActivePlan({ status: 'missing' }, NOW);
    expect(res.status).toBe('missing');
    expect(res.plan).toBe(PLANS.essentiel);
    expect(res.claims).toBeNull();
    expect(res.error).toBeInstanceOf(LicenseMissingError);
  });

  it('bad signature → essentiel + LicenseSignatureInvalidError (no self-upgrade)', () => {
    const res = resolveActivePlan({ status: 'invalid-signature' }, NOW);
    expect(res.status).toBe('invalid-signature');
    expect(res.plan).toBe(PLANS.essentiel);
    expect(res.claims).toBeNull();
    expect(res.error).toBeInstanceOf(LicenseSignatureInvalidError);
  });
});

describe('resolveActivePlan — binding enforcement (SOU-104)', () => {
  const BINDING = { machineId: 'machine-A', centerCode: 'CS-CASA-001' };

  it('resolves the tier when machine + center match the binding', () => {
    const res = resolveActivePlan(
      valid(claims({ machineId: 'machine-A', centerCode: 'CS-CASA-001' })),
      NOW,
      BINDING,
    );
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.premium);
  });

  it('falls back to essentiel + wrong-machine when the license is bound to another machine', () => {
    const res = resolveActivePlan(valid(claims({ machineId: 'machine-B' })), NOW, BINDING);
    expect(res.status).toBe('wrong-machine');
    expect(res.plan).toBe(PLANS.essentiel);
    expect(res.error).toBeInstanceOf(LicenseWrongMachineError);
    expect(res.claims?.plan).toBe('premium');
  });

  it('falls back to essentiel + wrong-center when the license is bound to another center', () => {
    const res = resolveActivePlan(valid(claims({ centerCode: 'CS-RABAT-002' })), NOW, BINDING);
    expect(res.status).toBe('wrong-center');
    expect(res.plan).toBe(PLANS.essentiel);
    expect(res.error).toBeInstanceOf(LicenseWrongCenterError);
  });

  it('ignores binding entirely when no binding context is supplied (SOU-98 behavior)', () => {
    const res = resolveActivePlan(valid(claims({ machineId: 'machine-B' })), NOW);
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.premium);
  });
});

describe('resolveActivePlan — demo licenses (SOU-110)', () => {
  // The demo center's own binding: machine-A, the demo center code. A demo
  // license claims `demo: true` and binds to CS-DEMO-001; its machine check is
  // skipped so the SAME pre-signed file activates on any sales laptop.
  const DEMO_BINDING = { machineId: 'machine-A', centerCode: 'CS-DEMO-001' };
  const demo = (overrides: Partial<LicenseClaims> = {}): LicenseClaims =>
    claims({ plan: 'premium', centerCode: 'CS-DEMO-001', demo: true, ...overrides });

  it('resolves active on the demo center regardless of machine binding', () => {
    const res = resolveActivePlan(valid(demo({ machineId: 'sales-laptop-1' })), NOW, DEMO_BINDING);
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.premium);
  });

  it('resolves active on ANY machine — even a different machine than the binding context', () => {
    const res = resolveActivePlan(
      valid(demo({ machineId: 'other-laptop' })),
      NOW,
      { machineId: 'this-laptop', centerCode: 'CS-DEMO-001' },
    );
    expect(res.status).toBe('active');
    expect(res.plan).toBe(PLANS.premium);
  });

  it('still rejects a demo license on the WRONG center — never leaks to a real center', () => {
    const res = resolveActivePlan(
      valid(demo({})),
      NOW,
      { machineId: 'any', centerCode: 'CS-CASA-001' },
    );
    expect(res.status).toBe('wrong-center');
    expect(res.plan).toBe(PLANS.essentiel);
  });

  it('still enforces expiry on a demo license', () => {
    const res = resolveActivePlan(
      valid(demo({ expiresAt: '2020-01-01T00:00:00.000Z' })),
      NOW,
      DEMO_BINDING,
    );
    expect(res.status).toBe('expired');
    expect(res.plan).toBe(PLANS.essentiel);
  });

  it('keeps the full machine check for a NON-demo license bound to another machine', () => {
    const res = resolveActivePlan(
      valid(claims({ machineId: 'machine-B', demo: false })),
      NOW,
      DEMO_BINDING,
    );
    expect(res.status).toBe('wrong-machine');
  });
});

describe('isLicenseExpired', () => {
  it('perpetual (null expiry) is never expired', () => {
    expect(isLicenseExpired(claims({ expiresAt: null }), NOW)).toBe(false);
  });

  it('future expiry is not expired', () => {
    expect(isLicenseExpired(claims({ expiresAt: '2099-01-01T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('past expiry is expired', () => {
    expect(isLicenseExpired(claims({ expiresAt: '2000-01-01T00:00:00.000Z' }), NOW)).toBe(true);
  });

  it('an unparsable expiry fails closed (treated as expired, never fail-open)', () => {
    expect(isLicenseExpired(claims({ expiresAt: 'not-a-date' }), NOW)).toBe(true);
  });
});
