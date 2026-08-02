import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherPayrollRulesGateway } from '../../lib/teacher-payroll-rules/teacher-payroll-rules-gateway';
import { teacherPayrollRuleKeys } from './keys';

/**
 * Closes a live payroll rule by capping its `endMonth` — the close half of the
 * close-and-reopen rule-change flow (CLAUDE.md §6). On success it invalidates
 * every rule list so the Rule tab refetches.
 */
export function useCloseTeacherPayrollRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, endMonth }: { ruleId: string; endMonth: string }) =>
      teacherPayrollRulesGateway.close(ruleId, endMonth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherPayrollRuleKeys.all }),
  });
}
