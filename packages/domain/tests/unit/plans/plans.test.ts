import { describe, expect, it } from 'vitest';
import { PLANS } from '../../../src/plans/plans';
import type { FeatureFlag, PlanId } from '../../../src/plans/plans';

const ids: PlanId[] = ['essentiel', 'pro', 'premium'];

describe('PLANS registry', () => {
  it('defines exactly the three plans', () => {
    expect(Object.keys(PLANS).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(PLANS[id].id).toBe(id);
  });

  it('is strictly cumulative: essentiel ⊂ pro ⊂ premium', () => {
    for (const flag of PLANS.essentiel.features) expect(PLANS.pro.features.has(flag)).toBe(true);
    for (const flag of PLANS.pro.features) expect(PLANS.premium.features.has(flag)).toBe(true);
    expect(PLANS.pro.features.size).toBeGreaterThan(PLANS.essentiel.features.size);
    expect(PLANS.premium.features.size).toBeGreaterThan(PLANS.pro.features.size);
  });

  it('gates representative features to the right tier', () => {
    // core is everywhere
    expect(PLANS.essentiel.features.has('core.students')).toBe(true);
    // pro-only
    expect(PLANS.essentiel.features.has('core.parents')).toBe(false);
    expect(PLANS.pro.features.has('core.parents')).toBe(true);
    expect(PLANS.pro.features.has('payroll.teacher')).toBe(true);
    // premium-only
    expect(PLANS.pro.features.has('sync.multi-device')).toBe(false);
    expect(PLANS.premium.features.has('sync.multi-device')).toBe(true);
    expect(PLANS.premium.features.has('dashboard.advanced')).toBe(true);
  });

  it('sets the documented limits', () => {
    expect(PLANS.essentiel.limits).toEqual({ maxStudents: 50, maxTeachers: 2, maxRooms: 1 });
    expect(PLANS.pro.limits).toEqual({ maxStudents: 300, maxTeachers: 10, maxRooms: 5 });
    expect(PLANS.premium.limits).toEqual({
      maxStudents: 'unlimited',
      maxTeachers: 'unlimited',
      maxRooms: 'unlimited',
    });
  });

  it('never encodes a plan name inside a feature flag', () => {
    const all: FeatureFlag[] = [...PLANS.premium.features];
    for (const flag of all) {
      expect(flag).not.toMatch(/essentiel|pro|premium/);
    }
  });
});
