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
} from '../../../src/errors/license-errors';

const NOW = new Date('2026-08-06T00:00:00.000Z');

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    plan: 'premium',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    machineId: null,
    centerCode: null,
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
