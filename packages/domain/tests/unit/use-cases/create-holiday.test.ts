import { describe, it, expect, beforeEach } from 'vitest';
import { CreateHoliday, type CreateHolidayInput } from '../../../src/use-cases/create-holiday';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<CreateHolidayInput> = {}): CreateHolidayInput {
  return {
    name: { fr: '  Fête du Trône ', ar: ' عيد العرش ' },
    kind: 'fixed',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateHoliday', () => {
  let holidays: InMemoryHolidayRepository;
  let useCase: CreateHoliday;

  beforeEach(() => {
    holidays = new InMemoryHolidayRepository();
    useCase = new CreateHoliday(
      holidays,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates a holiday with a prefixed id, trimmed bilingual name, and a fresh envelope', async () => {
      const holiday = await useCase.execute(validInput());

      expect(holiday.id).toMatch(/^hol_/);
      expect(holiday.name).toEqual({ fr: 'Fête du Trône', ar: 'عيد العرش' });
      expect(holiday.kind).toBe('fixed');
      expect(holiday.startDate).toBe('2026-07-30');
      expect(holiday.endDate).toBe('2026-07-30');
      expect(holiday.affectsInvoicing).toBe(false);
      expect(holiday.centerCode).toBe(CENTER);
      expect(holiday.deviceOrigin).toBe(DEVICE);
      expect(holiday.updatedBy).toBe(USER);
      expect(holiday.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(holiday.updatedAt).toEqual(holiday.createdAt);
      expect(holiday.deletedAt).toBeNull();
      expect(holiday.version).toBe(0);
    });

    it('persists the holiday so it can be read back by id', async () => {
      const holiday = await useCase.execute(validInput());
      expect(await holidays.findById(holiday.id)).toEqual(holiday);
    });

    it('accepts a lunar holiday spanning a multi-day range', async () => {
      const holiday = await useCase.execute(
        validInput({ kind: 'lunar', startDate: '2026-05-27', endDate: '2026-05-29' }),
      );
      expect(holiday.kind).toBe('lunar');
      expect(holiday.startDate).toBe('2026-05-27');
      expect(holiday.endDate).toBe('2026-05-29');
    });

    it('accepts a cross-year fixed range (endDate later as a full date)', async () => {
      const holiday = await useCase.execute(
        validInput({ startDate: '2026-12-24', endDate: '2027-01-04' }),
      );
      expect(holiday.startDate).toBe('2026-12-24');
      expect(holiday.endDate).toBe('2027-01-04');
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      await expect(useCase.execute(validInput({ name: { fr: '  ', ar: 'x' } }))).rejects.toThrow();
      expect(holidays.all()).toHaveLength(0);
    });

    it('rejects a blank Arabic name', async () => {
      await expect(useCase.execute(validInput({ name: { fr: 'x', ar: '' } }))).rejects.toThrow();
      expect(holidays.all()).toHaveLength(0);
    });

    it('rejects a malformed date', async () => {
      await expect(useCase.execute(validInput({ startDate: '2026-13-01' }))).rejects.toThrow();
      expect(holidays.all()).toHaveLength(0);
    });

    it('rejects endDate before startDate', async () => {
      await expect(
        useCase.execute(validInput({ startDate: '2026-07-30', endDate: '2026-07-29' })),
      ).rejects.toThrow();
      expect(holidays.all()).toHaveLength(0);
    });

    it('rejects an unknown kind', async () => {
      await expect(
        // @ts-expect-error — exercising the runtime guard with an invalid kind
        useCase.execute(validInput({ kind: 'weekly' })),
      ).rejects.toThrow();
      expect(holidays.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks settings.holidays', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateHoliday(holidays, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(holidays.all()).toHaveLength(0);
    });

    it('is available on every tier, including Essentiel (SOU-30 move)', async () => {
      for (const plan of [PLANS.essentiel, PLANS.pro, PLANS.premium]) {
        const repo = new InMemoryHolidayRepository();
        const uc = new CreateHoliday(repo, fakeClock(), fakeIds(), new PlanPolicy(plan));
        await expect(uc.execute(validInput())).resolves.toBeDefined();
      }
    });
  });
});
