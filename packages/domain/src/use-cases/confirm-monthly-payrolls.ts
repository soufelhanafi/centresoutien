import type { TeacherPayoutRepository } from '../ports/teacher-payout-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { TeacherPayout } from '../entities/teacher-payout';
import { confirmMonthlyPayrollsSchema } from '../schemas/teacher-payout';

export type ConfirmMonthlyPayrollsInput = {
  centerCode: CenterCode;
  month: string;
  updatedBy: UserId;
};

export type ConfirmMonthlyPayrollsResult = {
  confirmed: number;
  /** A live payout for `(teacherId, month)` that was already `paid` before this run — left untouched (immutable). */
  skippedAlreadyPaid: number;
};

/**
 * The payroll dashboard's "Mark all paid" bulk action (SOU-76): confirms
 * every live `draft` `TeacherPayout` for `(centerCode, month)` to `paid` in
 * one pass. Mirrors `ComputeMonthlyPayrolls`'s shape — iterate, upsert via
 * `payouts.save`, return skip-counted results — over the same
 * `listLiveByCenterMonth` read the dashboard list already uses.
 *
 * Unlike `ConfirmTeacherPayout` (the single-row action, which throws
 * `TeacherPayoutAlreadyPaidError` on a repeat target), a bulk confirm
 * naturally revisits rows a teammate already confirmed before this run — that
 * is expected, not an error, so it is counted under `skippedAlreadyPaid`
 * instead of aborting the whole batch. Deliberately does not delegate to
 * `ConfirmTeacherPayout` per row: turning its thrown error into a skip count
 * would mean using an exception for ordinary control flow, so the same
 * three-line guard-then-save is inlined here instead.
 *
 * Gated by `payroll.teacher` (Pro+).
 */
export class ConfirmMonthlyPayrolls {
  constructor(
    private readonly payouts: TeacherPayoutRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ConfirmMonthlyPayrollsInput): Promise<ConfirmMonthlyPayrollsResult> {
    this.plan.require('payroll.teacher');
    const { month } = confirmMonthlyPayrollsSchema.parse(input);

    const livePayouts = await this.payouts.listLiveByCenterMonth(input.centerCode, month);

    let confirmed = 0;
    let skippedAlreadyPaid = 0;

    for (const payout of livePayouts) {
      if (payout.status === 'paid') {
        skippedAlreadyPaid += 1;
        continue;
      }

      const patched: TeacherPayout = {
        ...payout,
        status: 'paid',
        updatedAt: this.clock.now(),
        updatedBy: input.updatedBy,
      };
      await this.payouts.save(patched);
      confirmed += 1;
    }

    return { confirmed, skippedAlreadyPaid };
  }
}
