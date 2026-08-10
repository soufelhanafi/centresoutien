import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

export type TeacherPayrollRuleWriteErrorCode =
  | 'too-many-active-payroll-rules'
  | 'invalid-payroll-rule-replacement-month'
  | 'teacher-payroll-rule-not-found'
  | 'teacher-not-found';

const CODES = new Set<string>([
  'too-many-active-payroll-rules',
  'invalid-payroll-rule-replacement-month',
  'teacher-payroll-rule-not-found',
  'teacher-not-found',
] satisfies TeacherPayrollRuleWriteErrorCode[]);

export function mapTeacherPayrollRuleWriteError(error: unknown): TeacherPayrollRuleWriteErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as TeacherPayrollRuleWriteErrorCode) : null;
}
