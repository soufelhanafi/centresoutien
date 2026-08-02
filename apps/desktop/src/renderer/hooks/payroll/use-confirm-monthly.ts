import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/** The "Marquer tout payé" bulk action. Invalidates the month's payout list on success. */
export function useConfirmMonthly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (month: string) => payrollGateway.confirmMonthly(month),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollKeys.all }),
  });
}
