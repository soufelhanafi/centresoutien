import { describe, it, expect, beforeEach } from 'vitest';
import { GetCenterHours } from '../../../src/use-cases/get-center-hours';
import { SaveCenterHours } from '../../../src/use-cases/save-center-hours';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { WeeklyHoursInput } from '../../../src/schemas/center-hours';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function fullWeek(): WeeklyHoursInput {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    windows: [{ open: '09:00', close: '18:00' }],
  })) as WeeklyHoursInput;
}

describe('GetCenterHours', () => {
  let hours: InMemoryCenterHoursRepository;
  let useCase: GetCenterHours;

  beforeEach(() => {
    hours = new InMemoryCenterHoursRepository();
    useCase = new GetCenterHours(hours, new PlanPolicy(PLANS.essentiel));
  });

  it('returns an empty week for a fresh center', async () => {
    expect(await useCase.execute({ centerCode: CENTER })).toEqual([]);
  });

  it('returns the saved rows ordered by weekday', async () => {
    const save = new SaveCenterHours(hours, fakeClock(), fakeIds(), new PlanPolicy(PLANS.essentiel));
    await save.execute({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER, week: fullWeek() });

    const result = await useCase.execute({ centerCode: CENTER });
    expect(result.map((row) => row.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks settings.center-hours', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new GetCenterHours(hours, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
