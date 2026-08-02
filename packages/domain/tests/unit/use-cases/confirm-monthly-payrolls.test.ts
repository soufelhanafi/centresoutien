import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfirmMonthlyPayrolls,
  type ConfirmMonthlyPayrollsInput,
} from '../../../src/use-cases/confirm-monthly-payrolls';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { TeacherPayout, TeacherPayoutId } from '../../../src/entities/teacher-payout';
import type { TeacherId } from '../../../src/entities/teacher';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryTeacherPayoutRepository } from '../fakes/in-memory-teacher-payout-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const CONFIRMED_BY = 'usr_00000000000000000000000002' as UserId;
const CLOCK_ISO = '2026-08-01T00:00:00Z';
const CONFIRM_ISO = '2026-08-02T09:00:00.000Z';
const MONTH = '2026-08';
const OTHER_MONTH = '2026-09';

const ids = fakeIds(1);
const seedClock = () => fakeClock(CLOCK_ISO);
const envelope = (overrides: { centerCode?: CenterCode } = {}) =>
  newEnvelope({ centerCode: overrides.centerCode ?? CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock());

describe('ConfirmMonthlyPayrolls', () => {
  let payouts: InMemoryTeacherPayoutRepository;

  beforeEach(() => {
    payouts = new InMemoryTeacherPayoutRepository();
  });

  function build(plan: Plan, clock = fakeClock(CONFIRM_ISO)): ConfirmMonthlyPayrolls {
    return new ConfirmMonthlyPayrolls(payouts, clock, new PlanPolicy(plan));
  }

  function seedPayout(
    teacherId: TeacherId,
    overrides: Partial<TeacherPayout> = {},
  ): TeacherPayout {
    const payout: TeacherPayout = {
      id: ids.next('pyo') as TeacherPayoutId,
      ...envelope({ centerCode: overrides.centerCode }),
      teacherId,
      month: MONTH,
      ruleKind: 'fixed-monthly',
      amountMad: 500000,
      baseAmountMad: null,
      percentSnapshot: null,
      status: 'draft',
      notes: null,
      ...overrides,
    };
    void payouts.save(payout);
    return payout;
  }

  function validInput(overrides: Partial<ConfirmMonthlyPayrollsInput> = {}): ConfirmMonthlyPayrollsInput {
    return { centerCode: CENTER, month: MONTH, updatedBy: CONFIRMED_BY, ...overrides };
  }

  describe('happy path', () => {
    it('confirms every live draft payout for the month', async () => {
      const teacher1 = 'tch_00000000000000000000000001' as TeacherId;
      const teacher2 = 'tch_00000000000000000000000002' as TeacherId;
      seedPayout(teacher1);
      seedPayout(teacher2);

      const result = await build(PLANS.pro).execute(validInput());

      expect(result).toEqual({ confirmed: 2, skippedAlreadyPaid: 0 });
      const live = await payouts.listLiveByCenterMonth(CENTER, MONTH);
      expect(live.every((p) => p.status === 'paid')).toBe(true);
      expect(live.every((p) => p.updatedBy === CONFIRMED_BY)).toBe(true);
      expect(live.every((p) => p.updatedAt.toISOString() === CONFIRM_ISO)).toBe(true);
    });

    it('ignores payouts from other months and other centers', async () => {
      const teacher1 = 'tch_00000000000000000000000001' as TeacherId;
      seedPayout(teacher1);
      seedPayout(teacher1, { id: ids.next('pyo') as TeacherPayoutId, month: OTHER_MONTH });
      seedPayout(teacher1, { id: ids.next('pyo') as TeacherPayoutId, centerCode: OTHER_CENTER });

      const result = await build(PLANS.pro).execute(validInput());

      expect(result).toEqual({ confirmed: 1, skippedAlreadyPaid: 0 });
    });
  });

  describe('already-paid rows (bulk skip, not an error)', () => {
    it('skips a payout already paid before this run and counts it, without touching the others', async () => {
      const teacher1 = 'tch_00000000000000000000000001' as TeacherId;
      const teacher2 = 'tch_00000000000000000000000002' as TeacherId;
      const alreadyPaid = seedPayout(teacher1, { status: 'paid', updatedBy: USER });
      seedPayout(teacher2);

      const result = await build(PLANS.pro).execute(validInput());

      expect(result).toEqual({ confirmed: 1, skippedAlreadyPaid: 1 });
      const stored = await payouts.findById(alreadyPaid.id);
      expect(stored?.updatedBy).toBe(USER); // untouched
    });
  });

  describe('idempotency (re-running the bulk action)', () => {
    it('confirms zero and skips everything on a second run', async () => {
      const teacher1 = 'tch_00000000000000000000000001' as TeacherId;
      seedPayout(teacher1);
      const job = build(PLANS.pro);

      const first = await job.execute(validInput());
      expect(first).toEqual({ confirmed: 1, skippedAlreadyPaid: 0 });

      const second = await job.execute(validInput());
      expect(second).toEqual({ confirmed: 0, skippedAlreadyPaid: 1 });
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const teacher1 = 'tch_00000000000000000000000001' as TeacherId;
      seedPayout(teacher1);
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      const live = await payouts.listLiveByCenterMonth(CENTER, MONTH);
      expect(live[0]?.status).toBe('draft');
    });
  });

  describe('validation', () => {
    it('rejects an invalid month', async () => {
      await expect(build(PLANS.pro).execute(validInput({ month: '2026-13' }))).rejects.toThrow();
    });
  });

  describe('zero live payouts that month', () => {
    it('returns all-zero counters', async () => {
      const result = await build(PLANS.pro).execute(validInput());
      expect(result).toEqual({ confirmed: 0, skippedAlreadyPaid: 0 });
    });
  });
});
