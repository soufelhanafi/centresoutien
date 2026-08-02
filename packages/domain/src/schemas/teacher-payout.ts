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
