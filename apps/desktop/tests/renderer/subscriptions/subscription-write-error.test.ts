import { describe, expect, it } from 'vitest';
import { encodeDomainError } from '../../../src/shared/ipc/domain-error';
import { mapSubscriptionWriteError } from '../../../src/renderer/lib/subscriptions/subscription-write-error';

describe('mapSubscriptionWriteError', () => {
  it.each([
    'too-many-active-subscriptions',
    'invalid-subscription-replacement-month',
    'student-subscription-not-found',
    'student-not-found',
  ] as const)('decodes %s from the rejection message (the real IPC path)', (code) => {
    const encoded = encodeDomainError({ code, message: 'boom' });
    const rejection = new Error(`Error invoking remote method 'subscription.replace': Error: ${encoded}`);
    expect(mapSubscriptionWriteError(rejection)).toBe(code);
  });

  it('returns null for an unrelated failure', () => {
    expect(mapSubscriptionWriteError(new Error('boom'))).toBeNull();
    expect(mapSubscriptionWriteError({ code: 'teacher-not-found' })).toBeNull();
  });
});
