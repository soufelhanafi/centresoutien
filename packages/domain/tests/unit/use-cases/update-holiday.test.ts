import { describe, it, expect, beforeEach } from 'vitest';
import { CreateHoliday } from '../../../src/use-cases/create-holiday';
import { UpdateHoliday, type UpdateHolidayInput } from '../../../src/use-cases/update-holiday';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
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
const EDITOR = 'usr_00000000000000000000000002' as UserId;

describe('UpdateHoliday', () => {
  let holidays: InMemoryHolidayRepository;
  let clock: ReturnType<typeof fakeClock>;
  let update: UpdateHoliday;
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
    update = new UpdateHoliday(holidays, clock, new PlanPolicy(PLANS.essentiel));
  });

  function edit(overrides: Partial<UpdateHolidayInput> = {}): UpdateHolidayInput {
    return {
      name: { fr: 'Aïd al-Fitr', ar: 'عيد الفطر' },
      kind: 'lunar',
      startDate: '2026-05-27',
      endDate: '2026-05-29',
      centerCode: CENTER,
      id: seeded.id,
      updatedBy: EDITOR,
      ...overrides,
    };
  }

  it('edits name/kind/date range, advancing updatedAt and updatedBy, preserving identity', async () => {
    clock.advance(60_000);
    const next = await update.execute(edit());

    expect(next.name).toEqual({ fr: 'Aïd al-Fitr', ar: 'عيد الفطر' });
    expect(next.endDate).toBe('2026-05-29');
    expect(next.updatedBy).toBe(EDITOR);
    expect(next.updatedAt).toEqual(new Date('2026-07-29T10:01:00Z'));
    // Identity + provenance preserved; version stays the hub's to assign.
    expect(next.id).toBe(seeded.id);
    expect(next.createdAt).toEqual(seeded.createdAt);
    expect(next.deviceOrigin).toBe(DEVICE);
    expect(next.version).toBe(0);
    expect(next.affectsInvoicing).toBe(false);
  });

  it('can switch kind from lunar to fixed', async () => {
    const next = await update.execute(edit({ kind: 'fixed', endDate: '2026-05-27' }));
    expect(next.kind).toBe('fixed');
  });

  it('is a no-op when nothing changed (no spurious updatedAt bump)', async () => {
    clock.advance(60_000);
    const next = await update.execute(
      edit({ name: seeded.name, kind: seeded.kind, startDate: seeded.startDate, endDate: seeded.endDate, updatedBy: seeded.updatedBy }),
    );
    expect(next.updatedAt).toEqual(seeded.updatedAt);
    expect(next.updatedBy).toBe(seeded.updatedBy);
  });

  it('throws HolidayNotFoundError for an unknown id', async () => {
    await expect(
      update.execute(edit({ id: 'hol_00000000000000000000000099' as HolidayId })),
    ).rejects.toBeInstanceOf(HolidayNotFoundError);
  });

  it('throws HolidayNotFoundError for a foreign-center id (never edits across tenants)', async () => {
    await expect(update.execute(edit({ centerCode: OTHER_CENTER }))).rejects.toBeInstanceOf(
      HolidayNotFoundError,
    );
  });

  it('validates the patch — rejects endDate before startDate', async () => {
    await expect(
      update.execute(edit({ startDate: '2026-05-29', endDate: '2026-05-27' })),
    ).rejects.toThrow();
  });
});
