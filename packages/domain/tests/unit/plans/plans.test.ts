import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, PLANS } from '../../../src/plans/plans';
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
    // The complete FeatureFlag set minus org.multi-center. Listing it in full (not a
    // sample) means dropping any shared flag from a tier fails this test.
    const everywhere: FeatureFlag[] = [
      'core.rooms',
      'core.teachers',
      'core.students',
      'core.groups',
      'core.subjects',
      'core.niveaux',
      'core.formulas',
      'core.calendar.week',
      'core.invoicing',
      'core.parents',
      'core.attendance',
      'settings.center-hours',
      'settings.holidays',
      'dashboard.basic',
      'core.invoicing.partial-paid',
      'core.invoice-template.customize',
      'core.exam-prep',
      'payroll.teacher',
      'payroll.teacher.fixed',
      'payroll.teacher.percentage',
      'io.excel.export',
      'io.excel.import',
      'io.excel.sync',
      'planning.custom-grid',
      'dashboard.advanced',
      'planning.random-auto',
      'sync.multi-device',
      'sync.cloud',
      'sync.conflict-resolution',
      'limits.students.unlimited',
      'limits.teachers.unlimited',
    ];
    expect(everywhere).not.toContain('org.multi-center');
    for (const id of ids) {
      for (const flag of everywhere) expect(PLANS[id].features.has(flag)).toBe(true);
    }
    // essentiel/pro carry exactly this set — no more, no less.
    expect(PLANS.essentiel.features.size).toBe(everywhere.length);
  });

  it('exports the complete feature flag list once', () => {
    expect([...FEATURE_FLAGS].sort()).toEqual([...PLANS.premium.features].sort());
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
