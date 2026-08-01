import { describe, it, expect } from 'vitest';
import {
  CrossKindEnrollmentError,
  DuplicateEnrollmentError,
  EnrollmentSubscriptionMissingError,
  GroupFullError,
} from '@centresoutien/domain';
import { enrollmentErrorCode } from '../../../src/renderer/lib/groups/enrollment-error';

describe('enrollmentErrorCode', () => {
  it('reads the stable code when the boundary preserves it', () => {
    expect(enrollmentErrorCode({ code: 'group-full' })).toBe('group-full');
    expect(enrollmentErrorCode({ code: 'duplicate-enrollment' })).toBe('duplicate-enrollment');
    expect(enrollmentErrorCode({ code: 'cross-kind-enrollment' })).toBe('cross-kind-enrollment');
    expect(enrollmentErrorCode({ code: 'enrollment-subscription-missing' })).toBe(
      'enrollment-subscription-missing',
    );
  });

  it('falls back to the domain error class name — the signal that survives IPC', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      [GroupFullError.name, 'group-full'],
      [DuplicateEnrollmentError.name, 'duplicate-enrollment'],
      [CrossKindEnrollmentError.name, 'cross-kind-enrollment'],
      [EnrollmentSubscriptionMissingError.name, 'enrollment-subscription-missing'],
    ];
    for (const [name, code] of cases) {
      expect(enrollmentErrorCode({ name, message: 'anything' })).toBe(code);
    }
  });

  it('returns null for errors that are not one of the four enrollment guards', () => {
    expect(enrollmentErrorCode({ name: 'TypeError' })).toBeNull();
    expect(enrollmentErrorCode({ code: 'enrollment-not-found' })).toBeNull();
    expect(enrollmentErrorCode(new Error('boom'))).toBeNull();
  });

  it('returns null for non-object inputs', () => {
    expect(enrollmentErrorCode(null)).toBeNull();
    expect(enrollmentErrorCode(undefined)).toBeNull();
    expect(enrollmentErrorCode('group-full')).toBeNull();
  });
});
