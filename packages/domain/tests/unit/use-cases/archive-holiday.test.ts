import { describe, it, expect, beforeEach } from 'vitest';
import { CreateHoliday } from '../../../src/use-cases/create-holiday';
import { ArchiveHoliday } from '../../../src/use-cases/archive-holiday';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
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
const DELETER = 'usr_00000000000000000000000002' as UserId;

describe('ArchiveHoliday', () => {
  let holidays: InMemoryHolidayRepository;
  let clock: ReturnType<typeof fakeClock>;
  let archive: ArchiveHoliday;
  let seeded: Holiday;

  beforeEach(async () => {
    holidays = new InMemoryHolidayRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    const create = new CreateHoliday(holidays, clock, fakeIds(), new PlanPolicy(PLANS.essentiel));
    seeded = await create.execute({
      name: { fr: 'Aïd', ar: 'عيد' },
      kind: 'lunar',
      startDate: '2026-05-27',
      endDate: '2026-05-27',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    archive = new ArchiveHoliday(holidays, clock, new PlanPolicy(PLANS.essentiel));
  });

  it('soft-deletes the holiday, stamping who and when on the tombstone', async () => {
    clock.advance(120_000);
    await archive.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: DELETER });

    expect(await holidays.findById(seeded.id)).toBeNull();
    const tombstone = await holidays.findArchivedById(seeded.id);
    expect(tombstone?.deletedAt).toEqual(new Date('2026-07-29T10:02:00Z'));
    expect(tombstone?.updatedBy).toBe(DELETER);
  });

  it('throws HolidayNotFoundError for an unknown id', async () => {
    await expect(
      archive.execute({
        centerCode: CENTER,
        holidayId: 'hol_00000000000000000000000099' as HolidayId,
        updatedBy: DELETER,
      }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws HolidayNotFoundError for an already-archived id (no silent no-op)', async () => {
    await archive.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: DELETER });
    await expect(
      archive.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws HolidayNotFoundError for a foreign-center id', async () => {
    await expect(
      archive.execute({ centerCode: OTHER_CENTER, holidayId: seeded.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks settings.holidays', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    archive = new ArchiveHoliday(holidays, clock, new PlanPolicy(planWithout));
    await expect(
      archive.execute({ centerCode: CENTER, holidayId: seeded.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    // Not archived.
    expect(await holidays.findById(seeded.id)).not.toBeNull();
  });
});
