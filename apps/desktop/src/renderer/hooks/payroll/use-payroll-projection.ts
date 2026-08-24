import { useQuery } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

// In-progress payroll projection (SOU-316) for an open month. `enabled` skips
// the round trip while plan-locked or on a closed month, mirroring usePayrollPayouts.
export function usePayrollProjection(month: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: payrollKeys.projection(month),
    queryFn: () => payrollGateway.getProjection(month),
    enabled: options.enabled,
    refetchOnWindowFocus: false,
  });
}
