import { describe, it, expect, beforeEach } from 'vitest';
import { GetCenterProfile } from '../../../src/use-cases/get-center-profile';
import { SaveCenterProfile } from '../../../src/use-cases/save-center-profile';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterRepository } from '../fakes/in-memory-center-repository';
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
    const save = new SaveCenterProfile(centers, fakeClock(), fakeIds());
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
