/**
 * The errors the teacher payroll rule write channels raise (SOU-72), as the
 * renderer must handle them. Only `.name` and `.message` survive the Electron
 * IPC boundary — never custom fields like `.code` — so the renderer matches on
 * the error's class name and localizes a fixed line via `t(\`errors.${code}\`)`.
 * Mirrors `mapFormulaWriteError`.
 */
export type TeacherPayrollRuleWriteErrorCode =
  | 'too-many-active-payroll-rules'
  | 'teacher-payroll-rule-not-found'
  | 'teacher-not-found';

const ERROR_NAME_TO_CODE: Readonly<Record<string, TeacherPayrollRuleWriteErrorCode>> = {
  TooManyActivePayrollRulesError: 'too-many-active-payroll-rules',
  TeacherPayrollRuleNotFoundError: 'teacher-payroll-rule-not-found',
  TeacherNotFoundError: 'teacher-not-found',
};

/**
 * Narrows a caught payroll rule write rejection to a
 * {@link TeacherPayrollRuleWriteErrorCode}, or `null` for an unrelated failure
 * that should toast generically.
 */
export function mapTeacherPayrollRuleWriteError(error: unknown): TeacherPayrollRuleWriteErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  for (const name of Object.keys(ERROR_NAME_TO_CODE)) {
    if (message.includes(name)) return ERROR_NAME_TO_CODE[name] ?? null;
  }
  return null;
}
