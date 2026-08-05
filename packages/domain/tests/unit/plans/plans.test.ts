import { describe, expect, it } from 'vitest';
import { PLANS } from '../../../src/plans/plans';
import type { FeatureFlag, PlanId } from '../../../src/plans/plans';

const ids: PlanId[] = ['essentiel', 'pro', 'premium'];

describe('PLANS registry', () => {
  it('defines exactly the three plans', () => {
    expect(Object.keys(PLANS).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(PLANS[id].id).toBe(id);
  });

  it('collapses essentiel and pro to the same feature set (SOU-83 MVP)', () => {
    expect([...PLANS.pro.features].sort()).toEqual([...PLANS.essentiel.features].sort());
  });

  it('grants premium exactly one extra flag: org.multi-center', () => {
    expect(PLANS.essentiel.features.has('org.multi-center')).toBe(false);
    expect(PLANS.pro.features.has('org.multi-center')).toBe(false);
    expect(PLANS.premium.features.has('org.multi-center')).toBe(true);
    expect(PLANS.premium.features.size).toBe(PLANS.essentiel.features.size + 1);
    for (const flag of PLANS.essentiel.features) {
      expect(PLANS.premium.features.has(flag)).toBe(true);
    }
  });

  it('ships every non-multi-center feature in every tier', () => {
    const everywhere: FeatureFlag[] = [
      'core.students',
      'core.parents',
      'payroll.teacher',
      'io.excel.import',
      'sync.multi-device',
      'sync.conflict-resolution',
      'dashboard.advanced',
      'planning.random-auto',
    ];
    for (const flag of everywhere) {
      for (const id of ids) expect(PLANS[id].features.has(flag)).toBe(true);
    }
  });

  it('sets unlimited limits on all three tiers', () => {
    const unlimited = { maxStudents: 'unlimited', maxTeachers: 'unlimited', maxRooms: 'unlimited' };
    for (const id of ids) expect(PLANS[id].limits).toEqual(unlimited);
  });

  it('never encodes a plan name inside a feature flag', () => {
    const all: FeatureFlag[] = [...PLANS.premium.features];
    for (const flag of all) {
      expect(flag).not.toMatch(/essentiel|pro|premium/);
    }
  });
});
