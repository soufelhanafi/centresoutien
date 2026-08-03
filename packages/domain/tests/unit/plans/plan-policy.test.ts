import { describe, expect, it } from 'vitest';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';

const essentiel = new PlanPolicy(PLANS.essentiel);
const premium = new PlanPolicy(PLANS.premium);

describe('PlanPolicy.has / require', () => {
  it('has() reflects the plan feature set', () => {
    expect(essentiel.has('core.students')).toBe(true);
    expect(essentiel.has('payroll.teacher')).toBe(false);
  });

  it('require() is a no-op when the feature is present', () => {
    expect(() => premium.require('sync.multi-device')).not.toThrow();
  });

  it('require() throws PlanFeatureUnavailableError carrying the flag and plan', () => {
    try {
      essentiel.require('payroll.teacher');
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
    expect(new PlanPolicy(PLANS.essentiel).activePlanId()).toBe('essentiel');
  });

  it('setActivePlan swaps the active plan so gating follows the new tier', () => {
    const policy = new PlanPolicy(PLANS.essentiel);
    expect(policy.has('payroll.teacher')).toBe(false);
    expect(() => policy.require('payroll.teacher')).toThrow(PlanFeatureUnavailableError);

    policy.setActivePlan(PLANS.pro);

    expect(policy.activePlanId()).toBe('pro');
    expect(policy.has('payroll.teacher')).toBe(true);
    expect(() => policy.require('payroll.teacher')).not.toThrow();
  });

  it('setActivePlan back to a lower tier re-locks the feature', () => {
    const policy = new PlanPolicy(PLANS.premium);
    expect(policy.has('dashboard.advanced')).toBe(true);

    policy.setActivePlan(PLANS.essentiel);

    expect(policy.has('dashboard.advanced')).toBe(false);
    expect(() => policy.require('dashboard.advanced')).toThrow(PlanFeatureUnavailableError);
  });
});

describe('PlanPolicy limits', () => {
  it('limit() returns the configured cap', () => {
    expect(essentiel.limit('maxStudents')).toBe(50);
    expect(premium.limit('maxStudents')).toBe('unlimited');
  });

  it('requireBelowLimit allows up to but not including the cap', () => {
    expect(() => essentiel.requireBelowLimit('maxStudents', 49)).not.toThrow();
    expect(() => essentiel.requireBelowLimit('maxStudents', 50)).toThrow(PlanLimitExceededError);
    expect(() => essentiel.requireBelowLimit('maxStudents', 51)).toThrow(PlanLimitExceededError);
  });

  it('requireBelowLimit never throws on an unlimited cap', () => {
    expect(() => premium.requireBelowLimit('maxStudents', 10_000)).not.toThrow();
  });

  it('PlanLimitExceededError carries the key, cap, and current count', () => {
    try {
      essentiel.requireBelowLimit('maxTeachers', 2);
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
