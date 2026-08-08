import { describe, expect, it } from 'vitest';
import type {
  CenterCode,
  Clock,
  LicenseBindingContext,
  LicensePort,
  LicenseVerification,
} from '@centresoutien/domain';
import { resolveStartupPlanId } from '../../src/main/composition-root';

const NOW = new Date('2026-08-06T00:00:00.000Z');
const BINDING: LicenseBindingContext = {
  machineId: 'machine-A',
  centerCode: 'CS-CASA-001' as CenterCode,
  demoAnchorTrusted: false,
};

const clock: Clock = { now: () => NOW };

function licensePort(installed: LicenseVerification): LicensePort {
  return {
    verify: () => installed,
    verifyContent: () => ({ status: 'invalid-signature' }),
  };
}

function validPremium(overrides: Partial<{ machineId: string | null; centerCode: string | null }> = {}): LicenseVerification {
  return {
    status: 'valid',
    claims: {
      plan: 'premium',
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      machineId: overrides.machineId ?? null,
      centerCode: overrides.centerCode ?? null,
      centersAllowed: null,
      founderDiscountExpiresAt: null,
      demo: false,
    },
  };
}

describe('resolveStartupPlanId (SOU-104 B1 hard lock)', () => {
  it('returns the license tier for an active, correctly-bound license regardless of build mode', () => {
    const license = licensePort(validPremium({ machineId: 'machine-A', centerCode: 'CS-CASA-001' }));
    expect(resolveStartupPlanId(license, clock, BINDING, 'essentiel', true)).toBe('premium');
    expect(resolveStartupPlanId(license, clock, BINDING, 'essentiel', false)).toBe('premium');
  });

  it('honors the dev override for a non-active license only in DEV', () => {
    const license = licensePort({ status: 'missing' });
    expect(resolveStartupPlanId(license, clock, BINDING, 'premium', true)).toBe('premium');
  });

  it('never grants a usable tier from a non-active license in a production build', () => {
    // Every non-active resolution must hard-lock in production: even with a
    // premium dev override, a bad license resolves to essentiel — the renderer
    // confines the app to the activation screen behind it (nothing runs).
    const cases: LicenseVerification[] = [
      { status: 'missing' },
      { status: 'invalid-signature' },
      validPremium({ machineId: 'machine-B' }), // wrong-machine
      validPremium({ centerCode: 'CS-RABAT-999' }), // wrong-center
      {
        status: 'valid',
        claims: {
          plan: 'premium',
          issuedAt: '2000-01-01T00:00:00.000Z',
          expiresAt: '2000-01-02T00:00:00.000Z', // expired
          machineId: null,
          centerCode: null,
          centersAllowed: null,
          founderDiscountExpiresAt: null,
          demo: false,
        },
      },
    ];

    for (const installed of cases) {
      expect(resolveStartupPlanId(licensePort(installed), clock, BINDING, 'premium', false)).toBe(
        'essentiel',
      );
    }
  });
});
