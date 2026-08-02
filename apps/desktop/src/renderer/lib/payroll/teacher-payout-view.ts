import type { TeacherPayrollRuleKind, TeacherPayoutStatus } from '@centresoutien/domain';

export type { TeacherPayrollRuleKind, TeacherPayoutStatus };

/**
 * Presentation projection of a `TeacherPayout` (SOU-76 payroll dashboard) — the
 * sync envelope is stripped, exactly like `TeacherPayrollRuleView`.
 * `baseAmountMad` / `percentSnapshot` are only meaningful for the
 * `percentage-of-monthly-fees` rule kind and are `null` for `fixed-monthly`
 * payouts.
 *
 * ## Contract status (SOU-76 frontend ↔ domain-backend)
 *
 * Not yet published on this branch: the `payroll.listPayouts` /
 * `payroll.confirmPayout` / `payroll.confirmMonthly` /
 * `payroll.attributionBreakdown` IPC channels (they exist on the sibling
 * `feature/SOU-76-domain` branch, not yet merged). This type is a hand-written
 * mirror of that branch's `teacherPayoutViewSchema` rather than an alias of a
 * generated IPC DTO — once the channels land, swap this to
 * `import type { TeacherPayoutDto } from '../../../shared/ipc/contract'` (see
 * `TeacherPayrollRuleView` for the target pattern) with no change to callers.
 */
export type TeacherPayoutView = {
  readonly id: string;
  readonly teacherId: string;
  readonly month: string;
  readonly ruleKind: TeacherPayrollRuleKind;
  readonly amountMad: number;
  readonly baseAmountMad: number | null;
  readonly percentSnapshot: number | null;
  readonly status: TeacherPayoutStatus;
  readonly notes: string | null;
};

/**
 * One teacher's attributed amount for one subject, for a given month — the
 * flat row shape `payroll.attributionBreakdown` returns for the whole month in
 * one call. The dashboard groups these client-side by `teacherId`, see
 * `groupBreakdownByTeacher`.
 */
export type TeacherAttributionBreakdownEntryView = {
  readonly teacherId: string;
  readonly subjectId: string;
  readonly amountMad: number;
};
