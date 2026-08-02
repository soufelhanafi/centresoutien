import { useQuery } from '@tanstack/react-query';
import { teacherPayrollRulesGateway } from '../../lib/teacher-payroll-rules/teacher-payroll-rules-gateway';
import { teacherPayrollRuleKeys } from './keys';

/**
 * Loads one teacher's live payroll rules (newest start first), for the Rule
 * tab's Active + History split. `enabled` lets the caller skip the IPC round
 * trip while the tab is plan-locked. Data access goes through the
 * {@link teacherPayrollRulesGateway} seam, not `window.api` directly.
 */
export function useTeacherPayrollRules(teacherId: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: teacherPayrollRuleKeys.list(teacherId),
    queryFn: () => teacherPayrollRulesGateway.list(teacherId),
    enabled: options.enabled,
    refetchOnWindowFocus: false,
  });
}
