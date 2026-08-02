import { describe, it, expect, beforeEach } from 'vitest';
import { GetTeacherAttributionBreakdown } from '../../../src/use-cases/get-teacher-attribution-breakdown';
import { MonthlyFeeAttributionService } from '../../../src/services/monthly-fee-attribution-service';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { InMemoryPaymentRepository } from '../fakes/in-memory-payment-repository';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';

const CENTER = 'CS-CASA-001' as CenterCode;
const MONTH = '2026-08';

describe('GetTeacherAttributionBreakdown', () => {
  let attribution: MonthlyFeeAttributionService;

  beforeEach(() => {
    attribution = new MonthlyFeeAttributionService(
      new InMemoryInvoiceRepository(),
      new InMemoryPaymentRepository(),
      new InMemoryFormulaRepository(),
      new InMemoryEnrollmentRepository(),
      new InMemoryGroupRepository(),
    );
  });

  function build(plan: Plan): GetTeacherAttributionBreakdown {
    return new GetTeacherAttributionBreakdown(attribution, new PlanPolicy(plan));
  }

  describe('happy path', () => {
    it('delegates to the attribution service', async () => {
      const result = await build(PLANS.pro).execute({ centerCode: CENTER, month: MONTH });

      expect(result.size).toBe(0); // no invoices seeded — empty-map convention
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks payroll.teacher', async () => {
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };

      await expect(build(planWithout).execute({ centerCode: CENTER, month: MONTH })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
