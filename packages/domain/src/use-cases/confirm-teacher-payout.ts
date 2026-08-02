import type { TeacherPayoutRepository } from '../ports/teacher-payout-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { TeacherPayout, TeacherPayoutId } from '../entities/teacher-payout';
import { TeacherPayoutNotFoundError, TeacherPayoutAlreadyPaidError } from '../errors/payroll-errors';

export type ConfirmTeacherPayoutInput = {
  centerCode: CenterCode;
  teacherPayoutId: TeacherPayoutId;
  updatedBy: UserId;
};

/**
 * Confirms a single `draft` `TeacherPayout` to `paid` (SOU-76) — the per-row
 * half of the dashboard's "Mark all paid" action (the bulk half is
 * `ConfirmMonthlyPayrolls`); also what a single row's own "Mark paid" button
 * calls. `TeacherPayout`'s own doc reserves this transition for SOU-76:
 * `ComputeMonthlyPayrolls` (SOU-74) only ever writes `draft`.
 *
 * Resolves the payout center-scoped first, mirroring `GeneratePayslipPdf`: an
 * unknown, already-tombstoned, or foreign-center id raises
 * {@link TeacherPayoutNotFoundError} before anything is touched. A payout
 * already `paid` raises {@link TeacherPayoutAlreadyPaidError} rather than
 * silently no-opping — paid payouts are immutable (CLAUDE.md §6/§13), and a
 * single-target action repeating that transition signals a stale UI state,
 * not a state the caller should shrug off. (The bulk confirm job takes the
 * opposite, skip-and-count stance for the same state — see its own doc.)
 *
 * The write bumps `updatedAt` from the injected `Clock` (UTC) and stamps the
 * actor's `updatedBy`; every other field, including `amountMad` and its
 * snapshots, is carried over untouched. Gated by `payroll.teacher` (Pro+).
 */
export class ConfirmTeacherPayout {
  constructor(
    private readonly payouts: TeacherPayoutRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ConfirmTeacherPayoutInput): Promise<TeacherPayout> {
    this.plan.require('payroll.teacher');

    const existing = await this.payouts.findById(input.teacherPayoutId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherPayoutNotFoundError(input.teacherPayoutId);
    }
    if (existing.status === 'paid') {
      throw new TeacherPayoutAlreadyPaidError(input.teacherPayoutId);
    }

    const confirmed: TeacherPayout = {
      ...existing,
      status: 'paid',
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.payouts.save(confirmed);
    return confirmed;
  }
}
