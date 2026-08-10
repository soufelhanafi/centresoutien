import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveCenterHoursOverride } from '../../../src/use-cases/archive-center-hours-override';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { CenterHoursOverrideNotFoundError } from '../../../src/errors/center-hours-override-errors';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
} from '../../../src/entities/center-hours-override';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const w = { open: '09:00' as TimeOfDay, close: '15:00' as TimeOfDay };

function override(id: string, centerCode: CenterCode = CENTER): CenterHoursOverride {
  return {
    id: id as CenterHoursOverrideId,
    centerCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    dateRange: { start: '2026-02-18', end: '2026-03-19' },
    hoursByWeekday: { 0: [w], 1: [w], 2: [w], 3: [w], 4: [w], 5: [w], 6: [w] },
  };
}

describe('ArchiveCenterHoursOverride', () => {
  let repo: InMemoryCenterHoursOverrideRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: ArchiveCenterHoursOverride;

  beforeEach(() => {
    repo = new InMemoryCenterHoursOverrideRepository();
    clock = fakeClock('2026-04-01T10:00:00Z');
    useCase = new ArchiveCenterHoursOverride(repo, clock, new PlanPolicy(PLANS.essentiel));
  });

  it('soft-deletes the override (findById returns null after; row survives in the sync feed)', async () => {
    const row = override('cho_1');
    await repo.save(row);
    await useCase.execute({ centerCode: CENTER, overrideId: row.id, updatedBy: USER });

    expect(await repo.findById(row.id)).toBeNull();
    const changed = await repo.listChangedSince(new Date('2026-01-01T00:00:00Z'));
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-04-01T10:00:00Z'));
    expect(await repo.listForCenter(CENTER)).toHaveLength(0);
  });

  it('rejects an unknown id', async () => {
    await expect(
      useCase.execute({ centerCode: CENTER, overrideId: 'cho_00000000000000000000009999' as CenterHoursOverrideId, updatedBy: USER }),
    ).rejects.toBeInstanceOf(CenterHoursOverrideNotFoundError);
  });

  it('rejects archiving an override owned by another center', async () => {
    const foreign = override('cho_9', OTHER_CENTER);
    await repo.save(foreign);
    await expect(
      useCase.execute({ centerCode: CENTER, overrideId: foreign.id, updatedBy: USER }),
    ).rejects.toBeInstanceOf(CenterHoursOverrideNotFoundError);
  });

  it('throws when the plan lacks settings.center-hours', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
    useCase = new ArchiveCenterHoursOverride(repo, clock, new PlanPolicy(planWithout));
    const row = override('cho_1');
    await repo.save(row);
    await expect(
      useCase.execute({ centerCode: CENTER, overrideId: row.id, updatedBy: USER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
