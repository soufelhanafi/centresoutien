/** Query keys for the teacher payroll rule module. Mirrors `formulaKeys`. */
export const teacherPayrollRuleKeys = {
  all: ['teacherPayrollRules'] as const,
  list: (teacherId: string) => ['teacherPayrollRules', 'list', teacherId] as const,
};
