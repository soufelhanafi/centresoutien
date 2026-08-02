import type { TeacherPayrollRuleInput, TeacherPayrollRuleView } from './teacher-payroll-rule-view';
import type { TeacherPayrollRulesGateway } from './teacher-payroll-rules-gateway';

/**
 * The real {@link TeacherPayrollRulesGateway}: maps each method onto its typed
 * IPC channel (SOU-72). No business logic — the domain use cases behind the
 * channels own it. Mirrors `IpcFormulasGateway`.
 */
class IpcTeacherPayrollRulesGateway implements TeacherPayrollRulesGateway {
  async list(teacherId: string): Promise<readonly TeacherPayrollRuleView[]> {
    const { rules } = await window.api.invoke('teacherPayrollRule.list', { teacherId });
    return rules;
  }

  async create(input: TeacherPayrollRuleInput): Promise<{ id: string }> {
    return window.api.invoke('teacherPayrollRule.create', input);
  }

  async close(ruleId: string, endMonth: string): Promise<TeacherPayrollRuleView> {
    const { rule } = await window.api.invoke('teacherPayrollRule.close', { ruleId, endMonth });
    return rule;
  }
}

export const ipcTeacherPayrollRulesGateway: TeacherPayrollRulesGateway = new IpcTeacherPayrollRulesGateway();
