import { beforeEach, describe, expect, it } from 'vitest';
import { GetLicenseStatus } from '../../../src/use-cases/get-license-status';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { LicenseClaims } from '../../../src/plans/license';
import { InMemoryLicensePort } from '../fakes/in-memory-license-port';
import { InMemoryCenterTrialStore } from '../fakes/in-memory-center-trial-store';
import { fakeMachineIdentity } from '../fakes/fake-machine-identity';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
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
    ...overrides,
  };
}

describe('GetLicenseStatus -- center trials', () => {
  let license: InMemoryLicensePort;
  let trials: InMemoryCenterTrialStore;
  let useCase: GetLicenseStatus;

  beforeEach(() => {
    license = new InMemoryLicensePort();
    trials = new InMemoryCenterTrialStore();
    useCase = new GetLicenseStatus(license, fakeMachineIdentity('machine-A'), fakeClock(NOW), CENTER, trials);
  });

  it('unlocks a missing-license center during its active 14-day trial', () => {
    trials.start(new Date('2026-08-01T00:00:00.000Z'));

    expect(useCase.execute()).toMatchObject({
      status: 'trial-active',
      plan: 'essentiel',
      restricted: false,
      trial: { startedAt: '2026-08-01T00:00:00.000Z', expiresAt: '2026-08-15T00:00:00.000Z' },
    });
  });

  it('hard-locks a missing-license center on trial day 15', () => {
    trials.start(new Date('2026-07-23T00:00:00.000Z'));

    expect(useCase.execute()).toMatchObject({
      status: 'trial-expired',
      plan: 'essentiel',
      restricted: true,
    });
  });

  it('does not retroactively grant a trial when no record was created at setup', () => {
    license.setInstalled({ status: 'missing' });

    expect(useCase.execute()).toMatchObject({ status: 'missing', restricted: true, trial: null });
  });

  it('updates the monotonic last-seen timestamp when the trial is checked', () => {
    trials.start(new Date('2026-08-01T00:00:00.000Z'));

    useCase.execute();

    expect(trials.get()?.lastSeenAt).toEqual(new Date(NOW));
  });

  it('does not write a trial checkpoint while evaluating restricted mode', () => {
    trials.start(new Date('2026-08-01T00:00:00.000Z'));

    expect(useCase.isRestricted()).toBe(false);
    expect(trials.get()?.lastSeenAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('lets a valid perpetual license convert an expired trial into licensed access', () => {
    trials.start(new Date('2026-07-01T00:00:00.000Z'));
    license.setInstalled({ status: 'valid', claims: claims({ plan: 'premium' }) });

    expect(useCase.execute()).toMatchObject({
      status: 'active',
      plan: 'premium',
      restricted: false,
    });
  });
});
