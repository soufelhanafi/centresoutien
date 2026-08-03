import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/** The per-row "Marquer payé" action. Invalidates the month's payout list on success. */
export function useConfirmPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teacherPayoutId: string) => payrollGateway.confirmPayout(teacherPayoutId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollKeys.all }),
  });
}
