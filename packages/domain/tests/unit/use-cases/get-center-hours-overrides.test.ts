import { describe, it, expect, beforeEach } from 'vitest';
import { GetCenterHoursOverrides } from '../../../src/use-cases/get-center-hours-overrides';
import { GetActiveCenterHoursOverride } from '../../../src/use-cases/get-active-center-hours-override';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';

const CENTER = 'CS-CASA-001' as CenterCode;
const w = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});
const uniform = (windows: readonly TimeWindow[]): WeeklyTimeWindows => ({
  0: windows, 1: windows, 2: windows, 3: windows, 4: windows, 5: windows, 6: windows,
});

function override(id: string, start: string, end: string): CenterHoursOverride {
  return {
    id: id as CenterHoursOverrideId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    dateRange: { start, end },
    hoursByWeekday: uniform([w('09:00', '15:00')]),
  };
}

describe('GetCenterHoursOverrides', () => {
  let repo: InMemoryCenterHoursOverrideRepository;
  let useCase: GetCenterHoursOverrides;

  beforeEach(() => {
    repo = new InMemoryCenterHoursOverrideRepository();
    useCase = new GetCenterHoursOverrides(repo, new PlanPolicy(PLANS.essentiel));
  });

  it('lists every live override for the center ordered by range start when no range is given', async () => {
    await repo.save(override('cho_2', '2026-06-01', '2026-06-30'));
    await repo.save(override('cho_1', '2026-02-18', '2026-03-19'));
    const result = await useCase.execute({ centerCode: CENTER });
    expect(result.map((o) => o.id)).toEqual(['cho_1', 'cho_2']);
  });

  it('returns only overrides intersecting the given range', async () => {
    await repo.save(override('cho_1', '2026-02-18', '2026-03-19'));
    await repo.save(override('cho_2', '2026-06-01', '2026-06-30'));
    const result = await useCase.execute({
      centerCode: CENTER,
      range: { start: '2026-03-01', end: '2026-03-31' },
    });
    expect(result.map((o) => o.id)).toEqual(['cho_1']);
  });

  it('throws when the plan lacks settings.center-hours', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
    useCase = new GetCenterHoursOverrides(repo, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});

describe('GetActiveCenterHoursOverride', () => {
  let repo: InMemoryCenterHoursOverrideRepository;
  let useCase: GetActiveCenterHoursOverride;

  beforeEach(() => {
    repo = new InMemoryCenterHoursOverrideRepository();
    useCase = new GetActiveCenterHoursOverride(repo, new PlanPolicy(PLANS.essentiel));
  });

  it('returns the override in effect on a date', async () => {
    await repo.save(override('cho_1', '2026-02-18', '2026-03-19'));
    const result = await useCase.execute({ centerCode: CENTER, date: '2026-03-01' });
    expect(result?.id).toBe('cho_1');
  });

  it('returns null when no override covers the date', async () => {
    await repo.save(override('cho_1', '2026-02-18', '2026-03-19'));
    expect(await useCase.execute({ centerCode: CENTER, date: '2026-05-01' })).toBeNull();
  });

  it('prefers the greatest id when two overrides overlap the date', async () => {
    await repo.save(override('cho_1', '2026-02-18', '2026-03-19'));
    await repo.save(override('cho_2', '2026-03-01', '2026-03-10'));
    const result = await useCase.execute({ centerCode: CENTER, date: '2026-03-05' });
    expect(result?.id).toBe('cho_2');
  });

  it('throws when the plan lacks settings.center-hours', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
    useCase = new GetActiveCenterHoursOverride(repo, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER, date: '2026-03-01' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
