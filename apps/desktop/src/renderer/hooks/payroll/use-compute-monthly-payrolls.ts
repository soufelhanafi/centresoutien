import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollGateway } from '../../lib/payroll/payroll-gateway';
import { payrollKeys } from './keys';

/** The "Calculer la paie du mois" bulk action. Invalidates the month's payout list on success. */
export function useComputeMonthlyPayrolls() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (month: string) => payrollGateway.computeMonthly(month),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollKeys.all }),
  });
}
