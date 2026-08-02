import type { TeacherRepository } from '../ports/teacher-repository';
import type { TeacherPayrollRuleRepository } from '../ports/teacher-payroll-rule-repository';
import type { TeacherPayoutRepository } from '../ports/teacher-payout-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { MonthlyFeeAttributionService } from '../services/monthly-fee-attribution-service';
import type { TeacherId } from '../entities/teacher';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { isPayrollRuleActiveInMonth } from '../policies/teacher-payroll-rule-policy';
import {
  TEACHER_PAYOUT_ID_PREFIX,
  type TeacherPayout,
  type TeacherPayoutId,
} from '../entities/teacher-payout';
import { computeMonthlyPayrollsSchema } from '../schemas/teacher-payout';

export type ComputeMonthlyPayrollsInput = {
  centerCode: CenterCode;
  month: string;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

export type ComputeMonthlyPayrollsResult = {
  created: number;
  updated: number;
  /** Active teacher, but no `TeacherPayrollRule` covers `month` — no row is written for them. */
  skippedNoRule: number;
  /** A payout for `(teacherId, month)` already exists and is `paid` — left untouched (immutable). */
  skippedAlreadyPaid: number;
};

/**
 * The monthly payroll compute job (SOU-74): for every active teacher with a live
 * `TeacherPayrollRule` covering `month`, computes the payout amount — the flat
 * amount for `fixed-monthly`, or the attribution base (via
 * `MonthlyFeeAttributionService`, wrapping the SOU-73 policy) × `percent` for
 * `percentage-of-monthly-fees` — and upserts a `draft` `TeacherPayout`.
 *
 * **Idempotent by the `(teacherId, month)` natural key**, not the row id:
 * re-running the job for a month it already computed replaces the existing
 * `draft` row's amount in place rather than inserting a second one, so a second
 * run produces zero duplicates (Done-when). A payout already confirmed `paid`
 * is read and then left untouched — paid payouts are immutable (CLAUDE.md
 * §6/§13), so a re-run after confirmation must never resurrect or amend it;
 * that teacher is counted in `skippedAlreadyPaid` instead.
 *
 * A teacher with no rule active in `month` gets no payout row at all — never a
 * zero-amount one (`skippedNoRule`), mirroring `GenerateMonthlyInvoices`'
 * unresolved-student convention. **Independent of attendance**: this reads only
 * `TeacherPayrollRule` and, for the percentage kind, attributable invoiced fees
 * — never session/attendance data — so the result never varies with how many
 * sessions actually happened that month.
 *
 * Gated by `payroll.teacher` (Pro+).
 */
export class ComputeMonthlyPayrolls {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly rules: TeacherPayrollRuleRepository,
    private readonly payouts: TeacherPayoutRepository,
    private readonly attribution: MonthlyFeeAttributionService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ComputeMonthlyPayrollsInput): Promise<ComputeMonthlyPayrollsResult> {
    this.plan.require('payroll.teacher');
    const { month } = computeMonthlyPayrollsSchema.parse(input);

    const activeTeachers = await this.teachers.listActive(input.centerCode);

    // Lazily computed at most once per run — a center whose live rules are all
    // `fixed-monthly` never pays the cost of scanning invoices/enrollments for
    // an attribution base nobody needs.
    let attributedByTeacher: ReadonlyMap<TeacherId, number> | null = null;

    let created = 0;
    let updated = 0;
    let skippedNoRule = 0;
    let skippedAlreadyPaid = 0;

    for (const teacher of activeTeachers) {
      const liveRules = await this.rules.listLiveByTeacher(teacher.id);
      const rule = liveRules.find((candidate) => isPayrollRuleActiveInMonth(candidate, month));
      if (!rule) {
        skippedNoRule += 1;
        continue;
      }

      let amountMad: number;
      if (rule.kind === 'fixed-monthly') {
        amountMad = rule.amountMad;
      } else {
        attributedByTeacher ??= await this.attribution.attributedAmountsByTeacher(
          input.centerCode,
          month,
        );
        const attributedBaseMad = attributedByTeacher.get(teacher.id) ?? 0;
        amountMad = Math.round((attributedBaseMad * rule.percent) / 100);
      }

      const existing = await this.payouts.findLiveByTeacherMonth(teacher.id, month);
      if (existing?.status === 'paid') {
        skippedAlreadyPaid += 1;
        continue;
      }

      if (existing) {
        const patched: TeacherPayout = {
          ...existing,
          ruleKind: rule.kind,
          amountMad,
          updatedAt: this.clock.now(),
          updatedBy: input.updatedBy,
        };
        await this.payouts.save(patched);
        updated += 1;
      } else {
        const payout: TeacherPayout = {
          id: this.ids.next(TEACHER_PAYOUT_ID_PREFIX) as TeacherPayoutId,
          ...newEnvelope(
            { centerCode: input.centerCode, deviceOrigin: input.deviceOrigin, updatedBy: input.updatedBy },
            this.clock,
          ),
          teacherId: teacher.id,
          month,
          ruleKind: rule.kind,
          amountMad,
          status: 'draft',
          notes: null,
        };
        await this.payouts.save(payout);
        created += 1;
      }
    }

    return { created, updated, skippedNoRule, skippedAlreadyPaid };
  }
}
