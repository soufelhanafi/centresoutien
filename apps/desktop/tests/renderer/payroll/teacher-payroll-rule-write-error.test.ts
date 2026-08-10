import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapTeacherPayrollRuleWriteError } from '../../../src/renderer/lib/teacher-payroll-rules/teacher-payroll-rule-write-error';

describe('mapTeacherPayrollRuleWriteError', () => {
  it.each([
    'too-many-active-payroll-rules',
    'invalid-payroll-rule-replacement-month',
    'teacher-payroll-rule-not-found',
    'teacher-not-found',
  ] as const)('decodes %s from the rejection message (the real IPC path)', (code) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    const rejection = new Error(`Error invoking remote method 'teacherPayrollRule.replace': Error: ${encoded}`);
    expect(mapTeacherPayrollRuleWriteError(rejection)).toBe(code);
  });

  it('returns null for an unrelated failure', () => {
    expect(mapTeacherPayrollRuleWriteError(new Error('boom'))).toBeNull();
    expect(mapTeacherPayrollRuleWriteError({ code: 'student-not-found' })).toBeNull();
  });
});
