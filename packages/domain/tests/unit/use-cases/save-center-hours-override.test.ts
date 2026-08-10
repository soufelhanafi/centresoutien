import { describe, it, expect, beforeEach } from 'vitest';
import {
  SaveCenterHoursOverride,
  type SaveCenterHoursOverrideInput,
} from '../../../src/use-cases/save-center-hours-override';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { CenterHoursOverrideNotFoundError } from '../../../src/errors/center-hours-override-errors';
import type { CenterHoursOverrideInput } from '../../../src/schemas/center-hours-override';
import type { CenterHoursOverrideId } from '../../../src/entities/center-hours-override';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

const ramadanWindows = [
  { open: '09:00', close: '15:00' },
  { open: '21:00', close: '23:00' },
];

function ramadanHours(): CenterHoursOverrideInput['hoursByWeekday'] {
  return { 0: ramadanWindows, 1: ramadanWindows, 2: ramadanWindows, 3: ramadanWindows, 4: ramadanWindows, 5: ramadanWindows, 6: ramadanWindows };
}

function validInput(overrides: Partial<SaveCenterHoursOverrideInput> = {}): SaveCenterHoursOverrideInput {
  return {
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    dateRange: { start: '2026-02-18', end: '2026-03-19' },
    hoursByWeekday: ramadanHours(),
    ...overrides,
  };
}

describe('SaveCenterHoursOverride', () => {
  let overrides: InMemoryCenterHoursOverrideRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: SaveCenterHoursOverride;

  beforeEach(() => {
    overrides = new InMemoryCenterHoursOverrideRepository();
    clock = fakeClock('2026-01-15T10:00:00Z');
    useCase = new SaveCenterHoursOverride(overrides, clock, fakeIds(), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path — create', () => {
    it('creates a fresh override with a full envelope and multi-window days', async () => {
      const saved = await useCase.execute(validInput());

      expect(saved.id).toMatch(/^cho_/);
      expect(saved.dateRange).toEqual({ start: '2026-02-18', end: '2026-03-19' });
      expect(saved.hoursByWeekday[1]).toEqual(ramadanWindows);
      expect(saved.centerCode).toBe(CENTER);
      expect(saved.deviceOrigin).toBe(DEVICE);
      expect(saved.updatedBy).toBe(USER);
      expect(saved.version).toBe(0);
      expect(saved.deletedAt).toBeNull();
      expect(saved.createdAt).toEqual(new Date('2026-01-15T10:00:00Z'));
      expect(await overrides.listForCenter(CENTER)).toHaveLength(1);
    });

    it('stores a closed weekday as an empty window list', async () => {
      const hoursByWeekday = ramadanHours();
      hoursByWeekday[5] = []; // Friday closed under the override
      const saved = await useCase.execute(validInput({ hoursByWeekday }));
      expect(saved.hoursByWeekday[5]).toEqual([]);
    });
  });

  describe('happy path — update', () => {
    it('edits the existing row in place and bumps updatedAt', async () => {
      const created = await useCase.execute(validInput());
      clock.advance(60_000);

      const updated = await useCase.execute(
        validInput({ id: created.id, dateRange: { start: '2026-02-18', end: '2026-03-20' } }),
      );

      expect(updated.id).toBe(created.id);
      expect(updated.dateRange.end).toBe('2026-03-20');
      expect(updated.updatedAt).toEqual(new Date('2026-01-15T10:01:00Z'));
      expect(await overrides.listForCenter(CENTER)).toHaveLength(1);
    });

    it('re-saving an unchanged override bumps no updatedAt (sync-quiet)', async () => {
      const created = await useCase.execute(validInput());
      clock.advance(60_000);
      const again = await useCase.execute(validInput({ id: created.id }));
      expect(again.updatedAt).toEqual(created.updatedAt);
      expect(again.version).toBe(0);
    });

    it('rejects an update to an unknown id', async () => {
      await expect(
        useCase.execute(validInput({ id: 'cho_00000000000000000000009999' as CenterHoursOverrideId })),
      ).rejects.toBeInstanceOf(CenterHoursOverrideNotFoundError);
    });

    it('rejects an update to an override owned by another center', async () => {
      const foreign = await useCase.execute(validInput({ centerCode: OTHER_CENTER }));
      await expect(
        useCase.execute(validInput({ id: foreign.id, centerCode: CENTER })),
      ).rejects.toBeInstanceOf(CenterHoursOverrideNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws when the plan lacks settings.center-hours and persists nothing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new SaveCenterHoursOverride(overrides, clock, fakeIds(), new PlanPolicy(planWithout));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(overrides.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects an inverted date range', async () => {
      await expect(
        useCase.execute(validInput({ dateRange: { start: '2026-03-19', end: '2026-02-18' } })),
      ).rejects.toThrow();
      expect(overrides.all()).toHaveLength(0);
    });

    it('rejects overlapping windows within a day (windows-overlap)', async () => {
      const hoursByWeekday = ramadanHours();
      hoursByWeekday[1] = [
        { open: '09:00', close: '15:00' },
        { open: '14:00', close: '18:00' }, // overlaps the previous window
      ];
      await expect(useCase.execute(validInput({ hoursByWeekday }))).rejects.toThrow(/windows-overlap/);
      expect(overrides.all()).toHaveLength(0);
    });

    it('rejects a malformed window (close <= open) under the same windows-overlap code', async () => {
      const hoursByWeekday = ramadanHours();
      hoursByWeekday[2] = [{ open: '15:00', close: '09:00' }];
      await expect(useCase.execute(validInput({ hoursByWeekday }))).rejects.toThrow(/windows-overlap/);
    });

    it('rejects a week missing a weekday', async () => {
      const hoursByWeekday = ramadanHours() as Record<number, typeof ramadanWindows>;
      delete hoursByWeekday[3];
      await expect(
        useCase.execute(validInput({ hoursByWeekday: hoursByWeekday as CenterHoursOverrideInput['hoursByWeekday'] })),
      ).rejects.toThrow();
    });
  });
});
