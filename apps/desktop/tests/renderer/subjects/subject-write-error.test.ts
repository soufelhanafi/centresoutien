import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapSubjectWriteError } from '../../../src/renderer/lib/subjects/subject-write-error';

describe('mapSubjectWriteError', () => {
  it.each(['subject-in-use', 'subject-not-found', 'duplicate-subject-code'] as const)(
    'decodes %s from the rejection message (the real IPC path)',
    (code) => {
      const encoded = encodeDomainError({ code, message: 'boom' });
      const rejection = new Error(`Error invoking remote method 'subject.create': Error: ${encoded}`);
      expect(mapSubjectWriteError(rejection)).toBe(code);
    },
  );

  it('reads a directly-attached code (in-process paths)', () => {
    expect(mapSubjectWriteError({ code: 'duplicate-subject-code' })).toBe('duplicate-subject-code');
  });

  it('returns null for an unrelated failure', () => {
    expect(mapSubjectWriteError(new Error('boom'))).toBeNull();
    expect(mapSubjectWriteError({ code: 'room-conflict' })).toBeNull();
  });
});
