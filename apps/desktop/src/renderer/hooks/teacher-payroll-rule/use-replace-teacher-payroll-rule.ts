import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeacherPayrollRuleInput } from '@centresoutien/domain';
import { teacherPayrollRulesGateway } from '../../lib/teacher-payroll-rules/teacher-payroll-rules-gateway';
import { teacherPayrollRuleKeys } from './keys';

type ReplaceTeacherPayrollRuleInput = TeacherPayrollRuleInput & { activeRuleId: string };

/** Atomically closes a live payroll rule and creates its replacement (SOU-141). */
export function useReplaceTeacherPayrollRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activeRuleId, ...input }: ReplaceTeacherPayrollRuleInput) =>
      teacherPayrollRulesGateway.replace(input, activeRuleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherPayrollRuleKeys.all }),
  });
}
