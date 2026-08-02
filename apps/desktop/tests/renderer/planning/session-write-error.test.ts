import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapSessionWriteError } from '../../../src/renderer/lib/planning/session-write-error';

describe('mapSessionWriteError', () => {
  it.each([
    ['malformed-session-time', 'malformed-session-time'],
    ['invalid-session-validity-range', 'invalid-session-validity-range'],
    ['weekly-recurring-session-not-found', 'weekly-recurring-session-not-found'],
  ] as const)('decodes the explicit domain code %s to %s', (domainCode, rendererCode) => {
    const encoded = encodeDomainError({ code: domainCode, message: 'boom' });
    expect(mapSessionWriteError(new Error(encoded))).toBe(rendererCode);
  });

  it.each([
    ['SessionOutsideCenterHoursError', 'session-outside-center-hours'],
    ['RoomConflictError', 'room-conflict'],
    ['TeacherConflictError', 'teacher-conflict'],
  ] as const)(
    'decodes %s (no explicit domain .code, dispatcher falls back to the class name) to %s',
    (className, rendererCode) => {
      const encoded = encodeDomainError({ code: className, message: 'boom' });
      const rejection = new Error(`Error invoking remote method 'session.create': Error: ${encoded}`);
      expect(mapSessionWriteError(rejection)).toBe(rendererCode);
    },
  );

  it('returns null for an unrelated failure', () => {
    expect(mapSessionWriteError(new Error('boom'))).toBeNull();
    expect(mapSessionWriteError({ code: 'subject-in-use' })).toBeNull();
  });
});
