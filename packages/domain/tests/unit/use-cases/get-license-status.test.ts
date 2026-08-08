import { beforeEach, describe, expect, it } from 'vitest';
import { GetLicenseStatus } from '../../../src/use-cases/get-license-status';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { LicenseClaims } from '../../../src/plans/license';
import { InMemoryLicensePort } from '../fakes/in-memory-license-port';
import { fakeMachineIdentity } from '../fakes/fake-machine-identity';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const MACHINE = 'machine-A';
const NOW = '2026-08-06T00:00:00.000Z';

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

describe('GetLicenseStatus', () => {
  let license: InMemoryLicensePort;
  let useCase: GetLicenseStatus;

  beforeEach(() => {
    license = new InMemoryLicensePort();
    useCase = new GetLicenseStatus(license, fakeMachineIdentity(MACHINE), fakeClock(NOW), CENTER, false);
  });

  it('reports the active tier and its metadata for a valid bound license', () => {
    license.setInstalled({
      status: 'valid',
      claims: claims({
        machineId: MACHINE,
        centerCode: CENTER,
        centersAllowed: 5,
        founderDiscountExpiresAt: '2099-01-01T00:00:00.000Z',
      }),
    });

    expect(useCase.execute()).toEqual({
      status: 'active',
      plan: 'premium',
      restricted: false,
      expiresAt: null,
      centersAllowed: 5,
      founderDiscountExpiresAt: '2099-01-01T00:00:00.000Z',
      founderDiscountExpired: false,
    });
  });

  it('falls back to restricted essentiel when no license is installed', () => {
    license.setInstalled({ status: 'missing' });
    expect(useCase.execute()).toMatchObject({
      status: 'missing',
      plan: 'essentiel',
      restricted: true,
    });
  });

  it('reports restricted invalid-signature for a tampered license (never crashes)', () => {
    license.setInstalled({ status: 'invalid-signature' });
    expect(useCase.execute()).toMatchObject({
      status: 'invalid-signature',
      plan: 'essentiel',
      restricted: true,
    });
  });

  it('reports restricted expired, keeping the lapsed tier visible in expiresAt', () => {
    license.setInstalled({
      status: 'valid',
      claims: claims({ expiresAt: '2026-08-05T00:00:00.000Z' }),
    });
    expect(useCase.execute()).toMatchObject({
      status: 'expired',
      plan: 'essentiel',
      restricted: true,
      expiresAt: '2026-08-05T00:00:00.000Z',
    });
  });

  it('reports restricted wrong-machine when the installed license is bound elsewhere', () => {
    license.setInstalled({
      status: 'valid',
      claims: claims({ machineId: 'machine-B' }),
    });
    expect(useCase.execute()).toMatchObject({
      status: 'wrong-machine',
      plan: 'essentiel',
      restricted: true,
    });
  });

  it('reports restricted wrong-center when the installed license is bound to another center', () => {
    license.setInstalled({
      status: 'valid',
      claims: claims({ centerCode: 'CS-RABAT-999' }),
    });
    expect(useCase.execute()).toMatchObject({
      status: 'wrong-center',
      plan: 'essentiel',
      restricted: true,
    });
  });

  it('flags a lapsed founder discount on an otherwise active license', () => {
    license.setInstalled({
      status: 'valid',
      claims: claims({ founderDiscountExpiresAt: '2026-01-01T00:00:00.000Z' }),
    });
    expect(useCase.execute()).toMatchObject({
      status: 'active',
      restricted: false,
      founderDiscountExpired: true,
    });
  });
});
