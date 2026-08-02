import { z } from 'zod';
import { MONTH_PATTERN } from './enrollment';

/**
 * `ComputeMonthlyPayrolls` input schema — just the month, `YYYY-MM`. The rest of
 * the input (`centerCode`, `deviceOrigin`, `updatedBy`) is envelope context set
 * by the caller, never user-typed, so it is not re-validated here (mirrors
 * `generateMonthlyInvoicesSchema`).
 */
export const computeMonthlyPayrollsSchema = z.object({
  month: z.string().regex(MONTH_PATTERN, { message: 'invalid-month' }),
});
export type ComputeMonthlyPayrollsFields = z.infer<typeof computeMonthlyPayrollsSchema>;

/**
 * `ConfirmMonthlyPayrolls` (SOU-76) input schema — same shape as
 * {@link computeMonthlyPayrollsSchema}, kept as its own named export since the
 * two use cases validate independently and a future divergence (e.g. a
 * confirm-specific constraint) shouldn't force the compute job's schema to
 * grow an unrelated branch.
 */
export const confirmMonthlyPayrollsSchema = z.object({
  month: z.string().regex(MONTH_PATTERN, { message: 'invalid-month' }),
});
export type ConfirmMonthlyPayrollsFields = z.infer<typeof confirmMonthlyPayrollsSchema>;

/**
 * Shared request shape for the payroll dashboard's two month-scoped reads
 * (`payroll.listPayouts`, `payroll.attributionBreakdown`) — same `YYYY-MM`
 * validation as the compute/confirm schemas above, so a malformed month is
 * rejected at the IPC boundary instead of reaching the repository/service.
 */
export const payrollMonthQuerySchema = z.object({
  month: z.string().regex(MONTH_PATTERN, { message: 'invalid-month' }),
});
export type PayrollMonthQueryFields = z.infer<typeof payrollMonthQuerySchema>;
