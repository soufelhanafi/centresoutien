import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeacherPayrollRuleInput } from '@centresoutien/domain';
import { teacherPayrollRulesGateway } from '../../lib/teacher-payroll-rules/teacher-payroll-rules-gateway';
import { teacherPayrollRuleKeys } from './keys';

/**
 * Creates a payroll rule. On success it invalidates every rule list so the Rule
 * tab refetches. Data access goes through the {@link teacherPayrollRulesGateway}
 * seam, not `window.api` directly.
 */
export function useCreateTeacherPayrollRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeacherPayrollRuleInput) => teacherPayrollRulesGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherPayrollRuleKeys.all }),
  });
}
