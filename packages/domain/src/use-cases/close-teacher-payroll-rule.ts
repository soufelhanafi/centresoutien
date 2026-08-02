import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { TeacherPayrollRule, TeacherPayrollRuleId } from '../entities/teacher-payroll-rule';
import { closeTeacherPayrollRuleMonthSchema } from '../schemas/teacher-payroll-rule';
import { TeacherPayrollRuleNotFoundError } from '../errors/payroll-errors';

export type CloseTeacherPayrollRuleInput = {
  centerCode: CenterCode;
  ruleId: TeacherPayrollRuleId;
  endMonth: string; // 'YYYY-MM', inclusive last active month
  updatedBy: UserId;
};

/**
 * Closes a live payroll rule by capping its `endMonth` — the only in-place
 * change a rule ever takes (CLAUDE.md §6: never edited in place to change kind
 * or amount). A rule change is this close plus a fresh
 * `CreateTeacherPayrollRule` starting a later month; this use case owns only
 * the close half.
 *
 * Gated by `payroll.teacher`. Validates the `endMonth` format with the shared
 * schema, then loads the rule center-scoped: an unknown, already-tombstoned,
 * or foreign-center id raises {@link TeacherPayrollRuleNotFoundError} before
 * anything is touched — a stale or wrong-tenant id can never silently no-op as
 * success (mirrors `CloseStudentSubscription`). Setting `endMonth` earlier than
 * `startMonth` is permitted and simply yields a rule that is active for zero
 * months by the derived-status rule (a full cancellation) — no separate error,
 * no stored status.
 *
 * The write bumps `updatedAt` from the injected `Clock` (UTC) and stamps the
 * actor's `updatedBy`, so a same-field clash on `endMonth` can show *who*
 * closed and when. Identity fields are untouched; the row is never
 * hard-deleted.
 */
export class CloseTeacherPayrollRule {
  constructor(
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CloseTeacherPayrollRuleInput): Promise<TeacherPayrollRule> {
    this.plan.require('payroll.teacher');
    const endMonth = closeTeacherPayrollRuleMonthSchema.parse(input.endMonth);

    const existing = await this.rules.findById(input.ruleId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherPayrollRuleNotFoundError(input.ruleId);
    }

    const closed: TeacherPayrollRule = {
      ...existing,
      endMonth,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.rules.save(closed);
    return closed;
  }
}
