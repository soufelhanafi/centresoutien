import type { MonthlyFeeAttributionService } from '../services/monthly-fee-attribution-service';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';

export type GetTeacherAttributionBreakdownInput = {
  centerCode: CenterCode;
  month: string;
};

/**
 * Each teacher's attributed amount for `month`, broken out by subject — the
 * payroll dashboard's per-teacher drill-down (SOU-76). Gated by
 * `payroll.teacher`, the same base gate `ComputeMonthlyPayrolls` already
 * requires; `MonthlyFeeAttributionService` itself takes no `PlanPolicy` (it is
 * a shared read used by the compute job under an already-gated caller), so
 * this wrapper is the one place the check lives for the dashboard's direct
 * read path.
 */
export class GetTeacherAttributionBreakdown {
  constructor(
    private readonly attribution: MonthlyFeeAttributionService,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(
    input: GetTeacherAttributionBreakdownInput,
  ): Promise<ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>>> {
    this.plan.require('payroll.teacher');
    return this.attribution.attributedAmountsByTeacherAndSubject(input.centerCode, input.month);
  }
}
