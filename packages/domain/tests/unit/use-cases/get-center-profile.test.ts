import { describe, it, expect, beforeEach } from 'vitest';
import { GetCenterProfile } from '../../../src/use-cases/get-center-profile';
import { SaveCenterProfile } from '../../../src/use-cases/save-center-profile';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterRepository } from '../fakes/in-memory-center-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterTrialStore } from '../fakes/in-memory-center-trial-store';
import { InMemoryCenterSetupUnitOfWork } from '../fakes/in-memory-center-setup-unit-of-work';
import { fakeLicenseAccess } from '../fakes/fake-license-access';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

describe('GetCenterProfile', () => {
  let centers: InMemoryCenterRepository;
  let get: GetCenterProfile;

  beforeEach(() => {
    centers = new InMemoryCenterRepository();
    get = new GetCenterProfile(centers);
  });

  it('returns null before the profile has ever been saved', async () => {
    expect(await get.execute()).toBeNull();
  });

  it('returns the saved center', async () => {
    const clock = fakeClock();
    const ids = fakeIds();
    const hours = new InMemoryCenterHoursRepository();
    const trials = new InMemoryCenterTrialStore();
    const save = new SaveCenterProfile(
      centers,
      clock,
      ids,
      new InMemoryCenterSetupUnitOfWork(centers, hours, trials),
      fakeLicenseAccess(false),
    );
    const saved = await save.execute({
      name: 'Centre Al Ilm',
      address: '',
      phone: '',
      email: '',
      logoPath: null,
      centerCode: 'CS-CASA-001' as CenterCode,
      deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
      updatedBy: 'usr_00000000000000000000000001' as UserId,
      seedPlan: 'essentiel',
    });

    expect(await get.execute()).toEqual(saved);
  });
});
