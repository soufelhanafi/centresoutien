import { describe, expect, it } from 'vitest';
import { PLANS } from '@centresoutien/domain';
import { FEATURE_TIER, minimumPlanFor } from '../../src/renderer/lib/plan/minimum-plan';

describe('FEATURE_TIER / minimumPlanFor', () => {
  it('assigns a tier to every feature flag the domain declares', () => {
    // Every flag any live plan grants must be tiered — otherwise a CTA would show
    // an undefined plan name. `PLANS.premium` is the superset of all flags.
    for (const flag of PLANS.premium.features) {
      expect(FEATURE_TIER[flag]).toBeDefined();
    }
  });

  it('names the intended tier per flag, not the flat MVP membership', () => {
    expect(minimumPlanFor('core.groups')).toBe('essentiel');
    expect(minimumPlanFor('payroll.teacher')).toBe('pro');
    expect(minimumPlanFor('io.excel.export')).toBe('pro');
    expect(minimumPlanFor('dashboard.advanced')).toBe('premium');
    expect(minimumPlanFor('sync.multi-device')).toBe('premium');
    expect(minimumPlanFor('org.multi-center')).toBe('premium');
  });

  it('only ever names a real plan', () => {
    const validPlans = new Set<string>(Object.keys(PLANS));
    for (const plan of Object.values(FEATURE_TIER)) {
      expect(validPlans.has(plan)).toBe(true);
    }
  });
});
