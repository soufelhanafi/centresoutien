import { useQuery } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/**
 * Loads the in-progress payroll projection (SOU-316) for an open month — the
 * per-teacher `encaissé` / `projeté` figures plus the projected subject
 * breakdown. `enabled` lets the caller skip the round trip while the page is
 * plan-locked or a closed month is selected, mirroring `usePayrollPayouts`.
 */
export function usePayrollProjection(month: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: payrollKeys.projection(month),
    queryFn: () => payrollGateway.getProjection(month),
    enabled: options.enabled,
    refetchOnWindowFocus: false,
  });
}
