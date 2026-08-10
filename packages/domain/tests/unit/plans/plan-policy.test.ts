import { describe, expect, it } from 'vitest';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import type { Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';

// Synthetic fixtures keep these mechanics tests independent of the live tier
// configuration in plans.ts — registry membership is asserted in plans.test.ts.
const locked: Plan = {
  id: 'essentiel',
  features: new Set(['core.students']),
  limits: { maxStudents: 50, maxTeachers: 2, maxRooms: 1 },
};

const unlocked: Plan = {
  id: 'premium',
  features: new Set(['core.students', 'payroll.teacher', 'sync.multi-device', 'dashboard.advanced']),
  limits: { maxStudents: 'unlimited', maxTeachers: 'unlimited', maxRooms: 'unlimited' },
};

const lockedPolicy = new PlanPolicy(locked);
const unlockedPolicy = new PlanPolicy(unlocked);

describe('PlanPolicy.has / require', () => {
  it('has() reflects the plan feature set', () => {
    expect(lockedPolicy.has('core.students')).toBe(true);
    expect(lockedPolicy.has('payroll.teacher')).toBe(false);
  });

  it('require() is a no-op when the feature is present', () => {
    expect(() => unlockedPolicy.require('sync.multi-device')).not.toThrow();
  });

  it('require() throws PlanFeatureUnavailableError carrying the flag and plan', () => {
    try {
      lockedPolicy.require('payroll.teacher');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanFeatureUnavailableError);
      const e = err as PlanFeatureUnavailableError;
      expect(e.feature).toBe('payroll.teacher');
      expect(e.planId).toBe('essentiel');
      expect(e.name).toBe('PlanFeatureUnavailableError');
    }
  });
});

describe('PlanPolicy.setActivePlan', () => {
  it('activePlanId() reflects the plan the policy was built with', () => {
    expect(new PlanPolicy(locked).activePlanId()).toBe('essentiel');
  });

  it('activeFeatures() reflects the exact active feature set', () => {
    expect(new PlanPolicy(locked).activeFeatures()).toEqual(['core.students']);
  });

  it('setActivePlan swaps the active plan so gating follows the new tier', () => {
    const policy = new PlanPolicy(locked);
    expect(policy.has('payroll.teacher')).toBe(false);
    expect(() => policy.require('payroll.teacher')).toThrow(PlanFeatureUnavailableError);

    policy.setActivePlan(unlocked);

    expect(policy.activePlanId()).toBe('premium');
    expect(policy.has('payroll.teacher')).toBe(true);
    expect(() => policy.require('payroll.teacher')).not.toThrow();
  });

  it('setActivePlan back to a lower tier re-locks the feature', () => {
    const policy = new PlanPolicy(unlocked);
    expect(policy.has('dashboard.advanced')).toBe(true);

    policy.setActivePlan(locked);

    expect(policy.has('dashboard.advanced')).toBe(false);
    expect(() => policy.require('dashboard.advanced')).toThrow(PlanFeatureUnavailableError);
  });
});

describe('PlanPolicy limits', () => {
  it('limit() returns the configured cap', () => {
    expect(lockedPolicy.limit('maxStudents')).toBe(50);
    expect(unlockedPolicy.limit('maxStudents')).toBe('unlimited');
  });

  it('requireBelowLimit allows up to but not including the cap', () => {
    expect(() => lockedPolicy.requireBelowLimit('maxStudents', 49)).not.toThrow();
    expect(() => lockedPolicy.requireBelowLimit('maxStudents', 50)).toThrow(PlanLimitExceededError);
    expect(() => lockedPolicy.requireBelowLimit('maxStudents', 51)).toThrow(PlanLimitExceededError);
  });

  it('requireBelowLimit never throws on an unlimited cap', () => {
    expect(() => unlockedPolicy.requireBelowLimit('maxStudents', 10_000)).not.toThrow();
  });

  it('PlanLimitExceededError carries the key, cap, and current count', () => {
    try {
      lockedPolicy.requireBelowLimit('maxTeachers', 2);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlanLimitExceededError);
      const e = err as PlanLimitExceededError;
      expect(e.limitKey).toBe('maxTeachers');
      expect(e.cap).toBe(2);
      expect(e.current).toBe(2);
    }
  });
});
