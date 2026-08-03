import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConfirmTeacherPayout,
  type ConfirmTeacherPayoutInput,
} from '../../../src/use-cases/confirm-teacher-payout';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherPayoutNotFoundError, TeacherPayoutAlreadyPaidError } from '../../../src/errors/payroll-errors';
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
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;

const ids = fakeIds(1);
const seedClock = () => fakeClock(CLOCK_ISO);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock());

describe('ConfirmTeacherPayout', () => {
  let payouts: InMemoryTeacherPayoutRepository;

  beforeEach(() => {
    payouts = new InMemoryTeacherPayoutRepository();
  });

  function build(plan: Plan, clock = fakeClock(CONFIRM_ISO)): ConfirmTeacherPayout {
    return new ConfirmTeacherPayout(payouts, clock, new PlanPolicy(plan));
  }

  function seedDraftPayout(overrides: Partial<TeacherPayout> = {}): TeacherPayout {
    const payout: TeacherPayout = {
      id: ids.next('pyo') as TeacherPayoutId,
      ...envelope(),
      teacherId: TEACHER,
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

  function validInput(overrides: Partial<ConfirmTeacherPayoutInput> = {}): ConfirmTeacherPayoutInput {
    return { centerCode: CENTER, teacherPayoutId: ids.next('pyo') as TeacherPayoutId, updatedBy: CONFIRMED_BY, ...overrides };
  }

  describe('happy path', () => {
    it('flips a draft payout to paid and stamps the confirming user/clock', async () => {
      const payout = seedDraftPayout();

      const result = await build(PLANS.pro).execute(
        validInput({ teacherPayoutId: payout.id }),
      );

      expect(result.status).toBe('paid');
      expect(result.updatedBy).toBe(CONFIRMED_BY);
      expect(result.updatedAt.toISOString()).toBe(CONFIRM_ISO);
      expect(result.amountMad).toBe(500000); // untouched

      const stored = await payouts.findById(payout.id);
      expect(stored?.status).toBe('paid');
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const payout = seedDraftPayout();
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(
        build(planWithout).execute(validInput({ teacherPayoutId: payout.id })),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect((await payouts.findById(payout.id))?.status).toBe('draft');
    });
  });

  describe('not found', () => {
    it('throws TeacherPayoutNotFoundError for an unknown id', async () => {
      await expect(build(PLANS.pro).execute(validInput())).rejects.toBeInstanceOf(
        TeacherPayoutNotFoundError,
      );
    });

    it('throws TeacherPayoutNotFoundError for a payout belonging to another center', async () => {
      const payout = seedDraftPayout({ centerCode: OTHER_CENTER });

      await expect(
        build(PLANS.pro).execute(validInput({ teacherPayoutId: payout.id })),
      ).rejects.toBeInstanceOf(TeacherPayoutNotFoundError);
    });

    it('throws TeacherPayoutNotFoundError for an already soft-deleted payout', async () => {
      const payout = seedDraftPayout();
      await payouts.softDelete(payout.id, seedClock().now(), USER);

      await expect(
        build(PLANS.pro).execute(validInput({ teacherPayoutId: payout.id })),
      ).rejects.toBeInstanceOf(TeacherPayoutNotFoundError);
    });
  });

  describe('already paid (immutability)', () => {
    it('throws TeacherPayoutAlreadyPaidError and leaves the row untouched', async () => {
      const payout = seedDraftPayout({ status: 'paid' });

      await expect(
        build(PLANS.pro).execute(validInput({ teacherPayoutId: payout.id })),
      ).rejects.toBeInstanceOf(TeacherPayoutAlreadyPaidError);

      const stored = await payouts.findById(payout.id);
      expect(stored?.updatedBy).toBe(USER); // untouched — not overwritten by CONFIRMED_BY
    });
  });
});
