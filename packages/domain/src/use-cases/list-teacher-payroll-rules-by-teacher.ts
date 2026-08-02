import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { TeacherPayrollRule } from '../entities/teacher-payroll-rule';
import type { TeacherId } from '../entities/teacher';
import { TeacherNotFoundError } from '../errors/people-errors';

export type ListTeacherPayrollRulesByTeacherInput = {
  centerCode: CenterCode;
  teacherId: TeacherId;
};

/**
 * Lists every live payroll rule for one teacher — the Rule tab's Active +
 * History sections (SOU-72), split client-side by `endMonth` (`null` = the
 * one open-ended rule = Active; set = History).
 * Gated by `payroll.teacher`, the same base gate `CreateTeacherPayrollRule` and
 * `CloseTeacherPayrollRule` already require.
 *
 * `TeacherPayrollRuleRepository.listLiveByTeacher` takes no `centerCode` (a rule
 * has no independent lookup key of its own), so this resolves the teacher first
 * and rejects an unknown or foreign-center id with `TeacherNotFoundError` before
 * touching the rules repository — mirrors `CreateTeacherPayrollRule`'s tenant
 * check, so a leaked or guessed teacherId from another center can never
 * enumerate that center's payroll rules.
 */
export class ListTeacherPayrollRulesByTeacher {
  constructor(
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly teachers: TeacherRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(
    input: ListTeacherPayrollRulesByTeacherInput,
  ): Promise<readonly TeacherPayrollRule[]> {
    this.plan.require('payroll.teacher');

    const teacher = await this.teachers.findById(input.teacherId);
    if (teacher === null || teacher.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(input.teacherId);
    }

    return this.rules.listLiveByTeacher(input.teacherId);
  }
}
