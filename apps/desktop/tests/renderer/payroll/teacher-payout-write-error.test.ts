import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapTeacherPayoutWriteError } from '../../../src/renderer/lib/payroll/teacher-payout-write-error';

describe('mapTeacherPayoutWriteError', () => {
  it.each(['teacher-payout-not-found', 'teacher-payout-already-paid'] as const)(
    'decodes %s from the rejection message (the real IPC path)',
    (code) => {
      const encoded = encodeDomainError({ code, message: 'boom' });
      const rejection = new Error(`Error invoking remote method 'payroll.confirmPayout': Error: ${encoded}`);
      expect(mapTeacherPayoutWriteError(rejection)).toBe(code);
    },
  );

  it('reads the code directly when present (in-process paths, e.g. the mock gateway)', () => {
    expect(mapTeacherPayoutWriteError({ code: 'teacher-payout-already-paid' })).toBe('teacher-payout-already-paid');
  });

  it('returns null for an unrelated failure', () => {
    expect(mapTeacherPayoutWriteError(new Error('boom'))).toBeNull();
    expect(mapTeacherPayoutWriteError({ code: 'subject-in-use' })).toBeNull();
  });
});
