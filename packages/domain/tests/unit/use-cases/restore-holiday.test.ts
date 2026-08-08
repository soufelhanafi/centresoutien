import { describe, it, expect, beforeEach } from 'vitest';
import { CreateHoliday } from '../../../src/use-cases/create-holiday';
import { ArchiveHoliday } from '../../../src/use-cases/archive-holiday';
import { RestoreHoliday } from '../../../src/use-cases/restore-holiday';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { planWithoutFeature } from '../fakes/plans';
import { HolidayNotFoundError } from '../../../src/errors/holiday-errors';
import type { Holiday, HolidayId } from '../../../src/entities/holiday';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ACTOR = 'usr_00000000000000000000000002' as UserId;

describe('RestoreHoliday', () => {
  let holidays: InMemoryHolidayRepository;
  let clock: ReturnType<typeof fakeClock>;
  let restore: RestoreHoliday;
  let seeded: Holiday;

  beforeEach(async () => {
    holidays = new InMemoryHolidayRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    const plan = new PlanPolicy(PLANS.essentiel);
    const create = new CreateHoliday(holidays, clock, fakeIds(), plan);
    seeded = await create.execute({
      name: { fr: 'Aïd', ar: 'عيد' },
      kind: 'lunar',
      startDate: '2026-05-27',
      endDate: '2026-05-27',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    await new ArchiveHoliday(holidays, clock, plan).execute({
      centerCode: CENTER,
      holidayId: seeded.id,
      updatedBy: USER,
    });
    restore = new RestoreHoliday(holidays, clock, plan);
  });

  it('clears the tombstone and returns the holiday to the live list', async () => {
    clock.advance(60_000);
    const restored = await restore.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: ACTOR });

    expect(restored.deletedAt).toBeNull();
    expect(restored.updatedBy).toBe(ACTOR);
    expect(restored.updatedAt).toEqual(new Date('2026-07-29T10:01:00Z'));
    expect(restored.version).toBe(0);
    expect(await holidays.findById(seeded.id)).not.toBeNull();
    expect(await holidays.findArchivedById(seeded.id)).toBeNull();
  });

  it('throws HolidayNotFoundError for an unknown id', async () => {
    await expect(
      restore.execute({
        centerCode: CENTER,
        holidayId: 'hol_00000000000000000000000099' as HolidayId,
        updatedBy: ACTOR,
      }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws HolidayNotFoundError for a live (non-archived) id', async () => {
    await restore.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: ACTOR });
    await expect(
      restore.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: ACTOR }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws HolidayNotFoundError for a foreign-center id', async () => {
    await expect(
      restore.execute({ centerCode: OTHER_CENTER, holidayId: seeded.id, updatedBy: ACTOR }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks settings.holidays', async () => {
    const locked = new RestoreHoliday(holidays, clock, new PlanPolicy(planWithoutFeature('settings.holidays')));
    await expect(
      locked.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: ACTOR }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    // Gate fires before any write: the holiday stays archived, not restored.
    expect(await holidays.findById(seeded.id)).toBeNull();
    expect(await holidays.findArchivedById(seeded.id)).not.toBeNull();
  });
});
