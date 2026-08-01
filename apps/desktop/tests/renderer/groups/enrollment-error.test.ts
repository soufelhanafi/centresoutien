import { describe, it, expect } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { enrollmentErrorCode } from '../../../src/renderer/lib/groups/enrollment-error';

describe('enrollmentErrorCode', () => {
  it('reads a directly-attached code (in-process paths)', () => {
    expect(enrollmentErrorCode({ code: 'group-full' })).toBe('group-full');
    expect(enrollmentErrorCode({ code: 'duplicate-enrollment' })).toBe('duplicate-enrollment');
    expect(enrollmentErrorCode({ code: 'cross-kind-enrollment' })).toBe('cross-kind-enrollment');
    expect(enrollmentErrorCode({ code: 'enrollment-subscription-missing' })).toBe(
      'enrollment-subscription-missing',
    );
  });

  it('decodes the code from the rejection message (the real IPC path)', () => {
    // Across the IPC + contextBridge hops only `message` survives; the code rides
    // inside it as an envelope, possibly behind Electron's remote-method prefix.
    const encoded = encodeDomainError({ code: 'group-full', message: 'Group is full' });
    const rejection = new Error(`Error invoking remote method 'enrollment.create': Error: ${encoded}`);
    expect(enrollmentErrorCode(rejection)).toBe('group-full');
  });

  it('returns null for codes that are not one of the four enrollment guards', () => {
    expect(enrollmentErrorCode({ code: 'enrollment-not-found' })).toBeNull();
    expect(
      enrollmentErrorCode(
        new Error(encodeDomainError({ code: 'group-not-found', message: 'x' })),
      ),
    ).toBeNull();
    // A bare Error (validation/transport failure, no envelope) → generic fallback.
    expect(enrollmentErrorCode(new Error('boom'))).toBeNull();
    expect(enrollmentErrorCode({ name: 'GroupFullError' })).toBeNull();
  });

  it('returns null for non-object inputs', () => {
    expect(enrollmentErrorCode(null)).toBeNull();
    expect(enrollmentErrorCode(undefined)).toBeNull();
    expect(enrollmentErrorCode('group-full')).toBeNull();
  });
});
