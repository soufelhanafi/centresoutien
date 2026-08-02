import { useQuery } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/**
 * Loads the whole month's attribution breakdown in one call, alongside
 * `usePayrollPayouts` — the per-teacher drill-down groups this flat array
 * client-side (`groupBreakdownByTeacher`) rather than calling once per
 * expanded row. `enabled` mirrors `usePayrollPayouts`.
 */
export function useAttributionBreakdown(month: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: payrollKeys.breakdown(month),
    queryFn: () => payrollGateway.attributionBreakdown(month),
    enabled: options.enabled,
    refetchOnWindowFocus: false,
  });
}
