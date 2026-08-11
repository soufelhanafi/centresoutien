import { describe, it, expect, beforeEach } from 'vitest';
import { SaveCenterHours, type SaveCenterHoursInput } from '../../../src/use-cases/save-center-hours';
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

function validInput(overrides: Partial<SaveCenterHoursInput> = {}): SaveCenterHoursInput {
  return {
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    week: fullWeek(),
    ...overrides,
  };
}

describe('SaveCenterHours', () => {
  let hours: InMemoryCenterHoursRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: SaveCenterHours;

  beforeEach(() => {
    hours = new InMemoryCenterHoursRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    useCase = new SaveCenterHours(hours, clock, fakeIds(), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('creates seven weekday rows on first save, each with a fresh envelope', async () => {
      const saved = await useCase.execute(validInput());

      expect(saved).toHaveLength(7);
      expect(saved.map((row) => row.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      for (const row of saved) {
        expect(row.id).toMatch(/^chr_/);
        expect(row.windows).toEqual([{ open: '09:00', close: '18:00' }]);
        expect(row.centerCode).toBe(CENTER);
        expect(row.deviceOrigin).toBe(DEVICE);
        expect(row.updatedBy).toBe(USER);
        expect(row.version).toBe(0);
        expect(row.deletedAt).toBeNull();
        expect(row.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      }
      expect(await hours.listForCenter(CENTER)).toHaveLength(7);
    });

    it('persists a closed day as an empty window list', async () => {
      const week = fullWeek();
      week[0] = { dayOfWeek: 0, windows: [] }; // close Sunday
      const saved = await useCase.execute(validInput({ week }));

      const sunday = saved.find((row) => row.dayOfWeek === 0);
      expect(sunday?.windows).toEqual([]);
    });

    it('persists a split day as two windows', async () => {
      const week = fullWeek();
      week[1] = {
        dayOfWeek: 1,
        windows: [
          { open: '09:00', close: '12:00' },
          { open: '14:00', close: '18:00' },
        ],
      }; // Monday: mid-day break
      const saved = await useCase.execute(validInput({ week }));

      const monday = saved.find((row) => row.dayOfWeek === 1);
      expect(monday?.windows).toEqual([
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ]);
    });
  });

  describe('idempotency / sync-neutrality', () => {
    it('re-saving an unchanged week bumps no updatedAt or version', async () => {
      const first = await useCase.execute(validInput());
      clock.advance(60_000);
      const second = await useCase.execute(validInput());

      for (let i = 0; i < 7; i += 1) {
        expect(second[i]?.id).toBe(first[i]?.id);
        expect(second[i]?.updatedAt).toEqual(first[i]?.updatedAt);
        expect(second[i]?.version).toBe(0);
      }
    });

    it('touches only the day that actually changed', async () => {
      const first = await useCase.execute(validInput());
      clock.advance(60_000);

      const week = fullWeek();
      week[1] = { dayOfWeek: 1, windows: [{ open: '08:00', close: '18:00' }] }; // change Monday only
      const second = await useCase.execute(validInput({ week }));

      const monBefore = first.find((row) => row.dayOfWeek === 1);
      const monAfter = second.find((row) => row.dayOfWeek === 1);
      expect(monAfter?.id).toBe(monBefore?.id); // same row, edited in place
      expect(monAfter?.windows).toEqual([{ open: '08:00', close: '18:00' }]);
      expect(monAfter?.updatedAt).toEqual(new Date('2026-07-29T10:01:00Z'));

      const tueBefore = first.find((row) => row.dayOfWeek === 2);
      const tueAfter = second.find((row) => row.dayOfWeek === 2);
      expect(tueAfter?.updatedAt).toEqual(tueBefore?.updatedAt); // untouched
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks settings.center-hours', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new SaveCenterHours(hours, clock, fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(hours.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a week that is not seven days', async () => {
      const week = fullWeek().slice(0, 6) as WeeklyHoursInput;
      await expect(useCase.execute(validInput({ week }))).rejects.toThrow();
      expect(hours.all()).toHaveLength(0);
    });

    it('rejects an overnight window and persists nothing', async () => {
      const week = fullWeek();
      week[2] = { dayOfWeek: 2, windows: [{ open: '18:00', close: '09:00' }] };
      await expect(useCase.execute(validInput({ week }))).rejects.toThrow();
      expect(hours.all()).toHaveLength(0);
    });
  });
});
