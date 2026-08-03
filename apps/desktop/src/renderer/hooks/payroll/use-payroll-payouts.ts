import { useQuery } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/**
 * Loads the month's payout list — one row per teacher who has a live payout
 * that month. `enabled` lets the caller skip the round trip while the page is
 * plan-locked. Data access goes through the {@link payrollGateway} seam, not
 * `window.api` directly, so the mock adapter swaps for the real IPC one in a
 * single place.
 */
export function usePayrollPayouts(month: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: payrollKeys.payouts(month),
    queryFn: () => payrollGateway.listPayouts(month),
    enabled: options.enabled,
    refetchOnWindowFocus: false,
  });
}
