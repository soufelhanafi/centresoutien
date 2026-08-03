import type { TeacherPayoutRepository } from '../ports/teacher-payout-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherPayout } from '../entities/teacher-payout';

export type ListTeacherPayoutsInput = {
  centerCode: CenterCode;
  month: string;
};

/**
 * Lists every live payout for the center in `month` — the payroll dashboard's
 * list view (SOU-76). Gated by `payroll.teacher`, the same base gate
 * `ComputeMonthlyPayrolls` and `ConfirmTeacherPayout` already require; a bare
 * `payoutRepo.listLiveByCenterMonth` call has no gate of its own, so this
 * wrapper is the one place that check lives for the read path.
 */
export class ListTeacherPayouts {
  constructor(
    private readonly payouts: TeacherPayoutRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListTeacherPayoutsInput): Promise<readonly TeacherPayout[]> {
    this.plan.require('payroll.teacher');
    return this.payouts.listLiveByCenterMonth(input.centerCode, input.month);
  }
}
