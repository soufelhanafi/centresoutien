import type { TeacherPayrollRuleKind, TeacherPayoutStatus } from '@centresoutien/domain';
import type { TeacherAttributionBreakdownEntryDto, TeacherPayoutDto } from '../../../shared/ipc/contract';

export type { TeacherPayrollRuleKind, TeacherPayoutStatus };

/**
 * Presentation projection of a `TeacherPayout` (SOU-76 payroll dashboard) — the
 * sync envelope is stripped, exactly like `TeacherPayrollRuleView`.
 * `baseAmountMad` / `percentSnapshot` are only meaningful for the
 * `percentage-of-monthly-fees` rule kind and are `null` for `fixed-monthly`
 * payouts.
 *
 * A direct alias of the boundary's `teacherPayoutViewSchema` (the single
 * source of truth in `shared/ipc/contract`), so the renderer shape can never
 * drift from what the `payroll.listPayouts` channel actually returns.
 */
export type TeacherPayoutView = TeacherPayoutDto;

/**
 * One teacher's attributed amount for one subject, for a given month — the
 * flat row shape `payroll.attributionBreakdown` returns for the whole month in
 * one call. The dashboard groups these client-side by `teacherId`, see
 * `groupBreakdownByTeacher`.
 */
export type TeacherAttributionBreakdownEntryView = TeacherAttributionBreakdownEntryDto;
