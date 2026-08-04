import { describe, it, expect } from 'vitest';
import {
  SecurityQuestionThrottlePolicy,
  MAX_FAILED_SECURITY_ANSWER_ATTEMPTS,
  SECURITY_QUESTION_LOCKOUT_DURATION_MS,
} from '../../../src/policies/security-question-throttle-policy';
import { UNLOCKED_STATE } from '../../../src/value-objects/lockout-state';

const NOW = new Date('2026-07-28T10:00:00Z');
const policy = new SecurityQuestionThrottlePolicy();

describe('SecurityQuestionThrottlePolicy', () => {
  it('reports no active lock from the unlocked state', () => {
    expect(policy.lockActiveUntil(UNLOCKED_STATE, NOW)).toBeNull();
    expect(policy.remainingAttempts(UNLOCKED_STATE)).toBe(MAX_FAILED_SECURITY_ANSWER_ATTEMPTS);
  });

  it('counts failures down without locking before the threshold', () => {
    let state = UNLOCKED_STATE;
    for (let i = 1; i < MAX_FAILED_SECURITY_ANSWER_ATTEMPTS; i += 1) {
      state = policy.registerFailure(state, NOW);
      expect(state.lockedUntil).toBeNull();
      expect(policy.remainingAttempts(state)).toBe(MAX_FAILED_SECURITY_ANSWER_ATTEMPTS - i);
    }
  });

  it('locks for 15 minutes on the third consecutive failure', () => {
    let state = UNLOCKED_STATE;
    for (let i = 0; i < MAX_FAILED_SECURITY_ANSWER_ATTEMPTS; i += 1) {
      state = policy.registerFailure(state, NOW);
    }

    expect(state.failedAttempts).toBe(MAX_FAILED_SECURITY_ANSWER_ATTEMPTS);
    expect(policy.remainingAttempts(state)).toBe(0);
    const until = policy.lockActiveUntil(state, NOW);
    expect(until).toBe(NOW.getTime() + SECURITY_QUESTION_LOCKOUT_DURATION_MS);
  });

  it('treats a lock as inactive once its window has elapsed', () => {
    let state = UNLOCKED_STATE;
    for (let i = 0; i < MAX_FAILED_SECURITY_ANSWER_ATTEMPTS; i += 1) {
      state = policy.registerFailure(state, NOW);
    }

    const after = new Date(NOW.getTime() + SECURITY_QUESTION_LOCKOUT_DURATION_MS + 1);
    expect(policy.lockActiveUntil(state, after)).toBeNull();
  });

  it('starts a fresh count when a failure lands after the lock expired', () => {
    let state = UNLOCKED_STATE;
    for (let i = 0; i < MAX_FAILED_SECURITY_ANSWER_ATTEMPTS; i += 1) {
      state = policy.registerFailure(state, NOW);
    }

    const after = new Date(NOW.getTime() + SECURITY_QUESTION_LOCKOUT_DURATION_MS + 1);
    const fresh = policy.registerFailure(state, after);
    expect(fresh.failedAttempts).toBe(1);
    expect(fresh.lockedUntil).toBeNull();
    expect(policy.remainingAttempts(fresh)).toBe(MAX_FAILED_SECURITY_ANSWER_ATTEMPTS - 1);
  });

  it('reset returns the unlocked state', () => {
    expect(policy.reset()).toEqual(UNLOCKED_STATE);
  });
});
