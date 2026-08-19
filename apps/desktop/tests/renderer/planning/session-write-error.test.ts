import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import {
  classifySessionWriteError,
  mapSessionWriteError,
} from '../../../src/renderer/lib/planning/session-write-error';

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

describe('classifySessionWriteError', () => {
  it('classifies the bare teacher-unavailable code as a forceable warning with no reason', () => {
    const encoded = encodeDomainError({ code: 'teacher-unavailable', message: 'boom' });
    expect(classifySessionWriteError(new Error(encoded))).toEqual({
      severity: 'warning',
      kind: 'teacher-availability',
      reason: null,
    });
  });

  it.each([
    ['teacher-unavailable-out-of-window', 'out-of-window'],
    ['teacher-unavailable-exception', 'exception'],
  ] as const)('carries the reason when the domain qualifies the code (%s)', (code, reason) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    expect(classifySessionWriteError(new Error(encoded))).toEqual({
      severity: 'warning',
      kind: 'teacher-availability',
      reason,
    });
  });

  it('classifies a hard scheduling clash as a blocking error', () => {
    const encoded = encodeDomainError({ code: 'RoomConflictError', message: 'boom' });
    expect(classifySessionWriteError(new Error(encoded))).toEqual({
      severity: 'error',
      code: 'room-conflict',
    });
  });

  it('returns null for an unrelated failure', () => {
    expect(classifySessionWriteError(new Error('boom'))).toBeNull();
  });
});
