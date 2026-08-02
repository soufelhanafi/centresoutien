import type { TeacherPayrollRuleInput, TeacherPayrollRuleView } from './teacher-payroll-rule-view';
import { ipcTeacherPayrollRulesGateway } from './ipc-teacher-payroll-rules-gateway';

/**
 * The seam the Rule tab depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place. Mirrors `FormulasGateway`. `create` echoes only the
 * new id (there is no `teacherPayrollRule.get` channel) — the caller refetches
 * `list` to see the fresh row, same as every other write on this tab.
 */
export interface TeacherPayrollRulesGateway {
  list(teacherId: string): Promise<readonly TeacherPayrollRuleView[]>;
  create(input: TeacherPayrollRuleInput): Promise<{ id: string }>;
  close(ruleId: string, endMonth: string): Promise<TeacherPayrollRuleView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const teacherPayrollRulesGateway: TeacherPayrollRulesGateway = ipcTeacherPayrollRulesGateway;
