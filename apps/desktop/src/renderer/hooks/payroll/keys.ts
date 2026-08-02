/** Query keys for the payroll dashboard module (SOU-76). Mutations invalidate `payrollKeys.all`. */
export const payrollKeys = {
  all: ['payroll'] as const,
  payouts: (month: string) => ['payroll', 'payouts', month] as const,
  breakdown: (month: string) => ['payroll', 'breakdown', month] as const,
};
