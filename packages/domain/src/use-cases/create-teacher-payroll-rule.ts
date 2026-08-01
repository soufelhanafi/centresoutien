import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import {
  teacherPayrollRuleInputSchema,
  type TeacherPayrollRuleInput,
} from '../schemas/teacher-payroll-rule';
import {
  TEACHER_PAYROLL_RULE_ID_PREFIX,
  type TeacherPayrollRule,
  type TeacherPayrollRuleId,
} from '../entities/teacher-payroll-rule';
import type { TeacherId } from '../entities/teacher';
import { TeacherNotFoundError } from '../errors/people-errors';
import { TooManyActivePayrollRulesError } from '../errors/payroll-errors';
import { payrollRuleRangesOverlap } from '../policies/teacher-payroll-rule-policy';

export type CreateTeacherPayrollRuleInput = TeacherPayrollRuleInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a payroll rule for a teacher. Gated by `payroll.teacher` (Pro+), plus
 * the kind-specific flag — `payroll.teacher.fixed` or
 * `payroll.teacher.percentage` — so a center can lack one rule type without
 * losing the other (both are Pro+ today, but the checks stay independent).
 *
 * Validates the user fields with the shared `teacherPayrollRuleInputSchema`
 * (a `z.discriminatedUnion`, so the `kind`-specific amount field is required
 * and typed), then runs the cross-entity checks a pure schema cannot:
 *
 *  1. The `teacherId` resolves to a live teacher **of the same center**
 *     (`TeacherNotFoundError`). Cross-center reads are rejected as "not
 *     found" — center scoping lives in the use case, since `findById` does
 *     not scope.
 *  2. No existing **live** rule for the teacher overlaps the requested
 *     `[startMonth, endMonth|∞]` range (`TooManyActivePayrollRulesError`) —
 *     the at-most-one-active-per-teacher invariant. Unlike student
 *     subscriptions this is not split by kind: a teacher cannot hold a live
 *     fixed-monthly rule and a live percentage rule at once either. Two
 *     non-overlapping rules (close-then-reopen) are allowed.
 *
 * A fresh rule carries the full envelope and is soft-deletable only; status is
 * derived from the month range, never stored.
 */
export class CreateTeacherPayrollRule {
  constructor(
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateTeacherPayrollRuleInput): Promise<TeacherPayrollRule> {
    this.plan.require('payroll.teacher');
    const fields = teacherPayrollRuleInputSchema.parse(input);
    this.plan.require(
      fields.kind === 'fixed-monthly' ? 'payroll.teacher.fixed' : 'payroll.teacher.percentage',
    );

    const teacherId = fields.teacherId as TeacherId;
    const teacher = await this.teachers.findById(teacherId);
    if (teacher === null || teacher.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(teacherId);
    }

    const existing = await this.rules.listLiveByTeacher(teacherId);
    const overlaps = existing.some((rule) =>
      payrollRuleRangesOverlap(fields.startMonth, fields.endMonth, rule.startMonth, rule.endMonth),
    );
    if (overlaps) {
      throw new TooManyActivePayrollRulesError(teacherId);
    }

    const envelope = newEnvelope(
      {
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      },
      this.clock,
    );
    const id = this.ids.next(TEACHER_PAYROLL_RULE_ID_PREFIX) as TeacherPayrollRuleId;

    const rule: TeacherPayrollRule =
      fields.kind === 'fixed-monthly'
        ? {
            id,
            ...envelope,
            teacherId,
            kind: 'fixed-monthly',
            amountMad: fields.amountMad,
            startMonth: fields.startMonth,
            endMonth: fields.endMonth,
          }
        : {
            id,
            ...envelope,
            teacherId,
            kind: 'percentage-of-monthly-fees',
            percent: fields.percent,
            startMonth: fields.startMonth,
            endMonth: fields.endMonth,
          };

    await this.rules.save(rule);
    return rule;
  }
}
