import { describe, it, expect, beforeEach } from 'vitest';
import { SeedDefaultCenterHours } from '../../../src/use-cases/seed-default-center-hours';
import { SaveCenterHours } from '../../../src/use-cases/save-center-hours';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { WeeklyHoursInput } from '../../../src/schemas/center-hours';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

const input = { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER };

describe('SeedDefaultCenterHours', () => {
  let hours: InMemoryCenterHoursRepository;
  let clock: ReturnType<typeof fakeClock>;
  let seed: SeedDefaultCenterHours;

  beforeEach(() => {
    hours = new InMemoryCenterHoursRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    seed = new SeedDefaultCenterHours(hours, clock, fakeIds());
  });

  it('persists seven weekday rows, each open 09:00–18:00, with a full sync-safe envelope', async () => {
    const seeded = await seed.execute(input);

    expect(seeded).toHaveLength(7);
    expect(seeded.map((day) => day.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const day of seeded) {
      expect(day.id).toMatch(/^chr_/);
      expect(day.windows).toEqual([{ open: '09:00', close: '18:00' }]);
      expect(day.centerCode).toBe(CENTER);
      expect(day.deviceOrigin).toBe(DEVICE);
      expect(day.updatedBy).toBe(USER);
      expect(day.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(day.updatedAt).toEqual(day.createdAt);
      expect(day.deletedAt).toBeNull();
      expect(day.version).toBe(0);
    }
  });

  it('persists so the seeded week reads back from the repository', async () => {
    await seed.execute(input);
    const week = await hours.listForCenter(CENTER);
    expect(week).toHaveLength(7);
  });

  it('is idempotent — a second run leaves the existing rows untouched', async () => {
    const first = await seed.execute(input);
    clock.advance(60_000);

    const second = await seed.execute(input);

    expect(second.map((day) => day.id)).toEqual(first.map((day) => day.id));
    expect(await hours.listForCenter(CENTER)).toHaveLength(7);
  });

  it('does not overwrite hours the admin already customized', async () => {
    const ids = fakeIds();
    const save = new SaveCenterHours(hours, clock, ids, new PlanPolicy(PLANS.essentiel));
    const customWeek: WeeklyHoursInput = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      windows: [{ open: '08:00', close: '12:00' }],
    }));
    await save.execute({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER, week: customWeek });

    await seed.execute(input);

    const week = await hours.listForCenter(CENTER);
    expect(week).toHaveLength(7);
    for (const day of week) {
      expect(day.windows).toEqual([{ open: '08:00', close: '12:00' }]);
    }
  });

  it('scopes seeding to the requested center only', async () => {
    await seed.execute(input);
    expect(await hours.listForCenter(OTHER_CENTER)).toHaveLength(0);
  });

  it('does not gate on a plan — seeding runs during the unlicensed first-run bootstrap', async () => {
    await expect(seed.execute(input)).resolves.toHaveLength(7);
  });
});
