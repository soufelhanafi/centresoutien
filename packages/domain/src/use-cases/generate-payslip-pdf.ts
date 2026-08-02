import type { TeacherPayoutRepository } from '../ports/teacher-payout-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { PayslipPdfRenderer } from '../ports/payslip-pdf-renderer';
import type { PlanPolicy } from '../plans/plan-policy';
import type { GetCenterProfile } from './get-center-profile';
import type { ReadCenterLogo } from './read-center-logo';
import type { TeacherPayoutId } from '../entities/teacher-payout';
import type { CenterCode } from '../value-objects/ids';
import { TeacherPayoutNotFoundError } from '../errors/payroll-errors';
import { TeacherNotFoundError } from '../errors/people-errors';

export type GeneratePayslipPdfInput = {
  centerCode: CenterCode;
  teacherPayoutId: TeacherPayoutId;
  locale: 'fr' | 'ar';
};

/**
 * Renders a confirmed `TeacherPayout` to a printable payslip PDF (SOU-75) — the
 * "Payslip" a teacher signs for records is this PDF, not a separate entity (see
 * `TeacherPayout`'s own doc). Stateless: renders equally well from a `draft` or
 * `paid` payout, since printing never mutates the payout's lifecycle.
 *
 * Resolves the payout and its teacher tenant-scoped, the same pattern as
 * `ListTeacherPayrollRulesByTeacher` — a leaked or guessed id from another
 * center can never render that center's payslip. Gated by `payroll.teacher`
 * (Pro+), the same base gate every payroll use case requires.
 */
export class GeneratePayslipPdf {
  constructor(
    private readonly payouts: TeacherPayoutRepository,
    private readonly teachers: TeacherRepository,
    private readonly getCenterProfile: Pick<GetCenterProfile, 'execute'>,
    private readonly readCenterLogo: Pick<ReadCenterLogo, 'execute'>,
    private readonly renderer: Pick<PayslipPdfRenderer, 'render'>,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GeneratePayslipPdfInput): Promise<Uint8Array> {
    this.plan.require('payroll.teacher');

    const payout = await this.payouts.findById(input.teacherPayoutId);
    if (payout === null || payout.centerCode !== input.centerCode) {
      throw new TeacherPayoutNotFoundError(input.teacherPayoutId);
    }

    const teacher = await this.teachers.findById(payout.teacherId);
    if (teacher === null || teacher.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(payout.teacherId);
    }

    const center = await this.getCenterProfile.execute();
    const logoBytes = center?.logoPath ? await this.readCenterLogo.execute({ path: center.logoPath }) : null;

    return this.renderer.render({
      locale: input.locale,
      payoutId: payout.id,
      teacher: teacher.name,
      month: payout.month,
      status: payout.status,
      ruleKind: payout.ruleKind,
      baseAmountMad: payout.baseAmountMad,
      percentSnapshot: payout.percentSnapshot,
      amountMad: payout.amountMad,
      notes: payout.notes,
      center: {
        name: center?.name ?? '',
        address: center?.address ?? '',
        phone: center?.phone ?? '',
        email: center?.email ?? '',
        logoBytes,
      },
    });
  }
}
