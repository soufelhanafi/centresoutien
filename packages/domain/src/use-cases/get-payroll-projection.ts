import type { TeacherRepository } from '../ports/teacher-repository';
import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { MonthlyFeeAttributionService } from '../services/monthly-fee-attribution-service';
import type { TeacherId } from '../entities/teacher';
import type { SubjectId } from '../entities/subject';
import type { CenterCode } from '../value-objects/ids';
import { isPayrollRuleActiveInMonth } from '../policies/teacher-payroll-rule-policy';
import {
  flattenAttributionByTeacher,
  projectPayoutAmounts,
  sumAttributionByTeacher,
  type TeacherPayrollProjection,
  type TeacherProjectedAttribution,
} from '../policies/payroll-projection-policy';

export type GetPayrollProjectionInput = {
  centerCode: CenterCode;
  month: string;
};

export type GetPayrollProjectionResult = {
  readonly projections: readonly TeacherPayrollProjection[];
  readonly projectedBreakdown: readonly TeacherProjectedAttribution[];
};

// In-progress / projected payroll read (SOU-316). Read-only: the finalized
// TeacherPayout for a closed month still comes from ComputeMonthlyPayrolls
// (SOU-74). Gated by payroll.teacher (Pro+). Attribution is computed lazily —
// an all-fixed-monthly center never scans the ledger.
export class GetPayrollProjection {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly attribution: MonthlyFeeAttributionService,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetPayrollProjectionInput): Promise<GetPayrollProjectionResult> {
    this.plan.require('payroll.teacher');

    const activeTeachers = await this.teachers.listActive(input.centerCode);

    let collectedByTeacher: ReadonlyMap<TeacherId, number> | null = null;
    let projectedByTeacher: ReadonlyMap<TeacherId, number> | null = null;
    let projectedByTeacherSubject: ReadonlyMap<TeacherId, ReadonlyMap<SubjectId, number>> | null =
      null;

    const projections: TeacherPayrollProjection[] = [];
    for (const teacher of activeTeachers) {
      const liveRules = await this.rules.listLiveByTeacher(teacher.id);
      const rule = liveRules.find((candidate) => isPayrollRuleActiveInMonth(candidate, input.month));
      if (!rule) continue;

      if (rule.kind === 'fixed-monthly') {
        projections.push({ teacherId: teacher.id, ...projectPayoutAmounts(rule, 0, 0) });
        continue;
      }

      collectedByTeacher ??= await this.attribution.attributedAmountsByTeacher(
        input.centerCode,
        input.month,
      );
      projectedByTeacherSubject ??= await this.attribution.projectedAttributedAmountsByTeacherAndSubject(
        input.centerCode,
        input.month,
      );
      projectedByTeacher ??= sumAttributionByTeacher(projectedByTeacherSubject);

      const amounts = projectPayoutAmounts(
        rule,
        collectedByTeacher.get(teacher.id) ?? 0,
        projectedByTeacher.get(teacher.id) ?? 0,
      );
      projections.push({ teacherId: teacher.id, ...amounts });
    }

    const projectedBreakdown = projectedByTeacherSubject
      ? flattenAttributionByTeacher(projectedByTeacherSubject)
      : [];

    return { projections, projectedBreakdown };
  }
}
