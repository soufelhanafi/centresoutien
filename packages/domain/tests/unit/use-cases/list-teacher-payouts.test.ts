import { describe, it, expect, beforeEach } from 'vitest';
import { ListTeacherPayouts } from '../../../src/use-cases/list-teacher-payouts';
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
const MONTH = '2026-08';
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;

const ids = fakeIds(1);
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-08-01T00:00:00Z'));

describe('ListTeacherPayouts', () => {
  let payouts: InMemoryTeacherPayoutRepository;

  beforeEach(() => {
    payouts = new InMemoryTeacherPayoutRepository();
  });

  function build(plan: Plan): ListTeacherPayouts {
    return new ListTeacherPayouts(payouts, new PlanPolicy(plan));
  }

  function seedPayout(overrides: Partial<TeacherPayout> = {}): TeacherPayout {
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

  describe('happy path', () => {
    it("returns the center's live payouts for the month", async () => {
      const payout = seedPayout();
      seedPayout({ centerCode: OTHER_CENTER });

      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(payout.id);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      seedPayout();
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute({ centerCode: CENTER, month: MONTH })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
