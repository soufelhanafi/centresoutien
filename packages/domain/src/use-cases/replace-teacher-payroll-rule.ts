import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { previousMonth } from '../value-objects/month';
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
import {
  TeacherPayrollRuleNotFoundError,
  TooManyActivePayrollRulesError,
} from '../errors/payroll-errors';
import { payrollRuleRangesOverlap } from '../policies/teacher-payroll-rule-policy';

export type ReplaceTeacherPayrollRuleInput = TeacherPayrollRuleInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** The currently-live rule this replaces — closed one month before the new rule starts. */
  activeRuleId: TeacherPayrollRuleId;
};

export type ReplaceTeacherPayrollRuleResult = {
  /** The just-capped incumbent rule (its new `endMonth` = the month before `startMonth`). */
  closed: TeacherPayrollRule;
  /** The fresh replacement rule. */
  created: TeacherPayrollRule;
};

/**
 * The close-and-reopen pattern as ONE operation (CLAUDE.md §6): a mid-course
 * rule change is a close of the current live rule plus a fresh rule starting a
 * later month. SOU-141 — `SetTeacherPayrollRuleDialog` historically issued
 * those as two separate, non-transactional IPC calls: if the create failed
 * after the close committed (crash, power loss, IPC error), the teacher was
 * left with **no** live rule. This use case replaces that two-call dance with a
 * single `replaceLiveRule` write that commits the close and the create together
 * or not at all.
 *
 * Gated by `payroll.teacher` (Pro+) plus the kind-specific flag (shared with
 * `CreateTeacherPayrollRule`). Validates the fields with the shared schema,
 * resolves the **same-center** teacher, and resolves the incumbent rule
 * center-scoped — an unknown, already-tombstoned, or foreign-center id raises
 * {@link TeacherPayrollRuleNotFoundError} before anything is touched. It then
 * runs the at-most-one-active overlap guard for the new rule's range against
 * every other live rule of that teacher (the incumbent being replaced is
 * excluded — it is about to be closed). The incumbent is capped at the month
 * *before* the replacement starts, guaranteeing the two never overlap by the
 * guard's own interval test.
 *
 * Both entities are stamped with the injected `Clock` (UTC) and the actor's
 * `updatedBy`; a fresh ULID is minted for the replacement. The write is a
 * single atomic repository call — see {@link TeacherPayrollRuleRepository
 * .replaceLiveRule} for the rollback guarantee.
 */
export class ReplaceTeacherPayrollRule {
  constructor(
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly teachers: TeacherRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ReplaceTeacherPayrollRuleInput): Promise<ReplaceTeacherPayrollRuleResult> {
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

    const active = await this.rules.findById(input.activeRuleId);
    if (active === null || active.centerCode !== input.centerCode) {
      throw new TeacherPayrollRuleNotFoundError(input.activeRuleId);
    }

    const live = await this.rules.listLiveByTeacher(teacherId);
    const overlaps = live.some(
      (rule) =>
        rule.id !== input.activeRuleId &&
        payrollRuleRangesOverlap(fields.startMonth, fields.endMonth, rule.startMonth, rule.endMonth),
    );
    if (overlaps) {
      throw new TooManyActivePayrollRulesError(teacherId);
    }

    const now = this.clock.now();
    const closed: TeacherPayrollRule = {
      ...active,
      endMonth: previousMonth(fields.startMonth),
      updatedAt: now,
      updatedBy: input.updatedBy,
    };

    const envelope = newEnvelope(
      {
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      },
      this.clock,
    );
    const id = this.ids.next(TEACHER_PAYROLL_RULE_ID_PREFIX) as TeacherPayrollRuleId;
    const created: TeacherPayrollRule =
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

    await this.rules.replaceLiveRule(closed, created);
    return { closed, created };
  }
}
