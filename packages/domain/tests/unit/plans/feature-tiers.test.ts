import { describe, expect, it } from 'vitest';
import { FEATURE_TIER, minimumPlanFor } from '../../../src/plans/feature-tiers';
import { FEATURE_FLAGS, PLANS } from '../../../src/plans/plans';
import type { FeatureFlag, PlanId } from '../../../src/plans/plans';

const allFlags: readonly FeatureFlag[] = FEATURE_FLAGS;
const planRank: Record<PlanId, number> = { essentiel: 0, pro: 1, premium: 2 };

describe('FEATURE_TIER map', () => {
  it('assigns a tier to every feature flag in the union', () => {
    // The map is typed `Record<FeatureFlag, PlanId>`, so a missing flag is a
    // compile error; this guards the runtime shape too (no stray/duplicate keys).
    for (const flag of allFlags) {
      expect(['essentiel', 'pro', 'premium']).toContain(FEATURE_TIER[flag]);
    }
    expect(Object.keys(FEATURE_TIER).sort()).toEqual([...FEATURE_FLAGS].sort());
    expect(allFlags.length).toBe(PLANS.premium.features.size);
  });

  it('names a tier that actually grants the flag (wording matches reality)', () => {
    for (const flag of allFlags) {
      const tier = FEATURE_TIER[flag];
      expect(PLANS[tier].features.has(flag)).toBe(true);
    }
  });

  it('never points a CTA below a plan that already lacks the feature', () => {
    // If a plan does NOT have the flag, its rank must be strictly below the
    // intended tier — otherwise the CTA would send the user to a plan too low to
    // unlock it. Catches a future re-split that forgets to raise a flag's tier.
    for (const flag of allFlags) {
      const tierRank = planRank[FEATURE_TIER[flag]];
      for (const id of Object.keys(PLANS) as PlanId[]) {
        if (!PLANS[id].features.has(flag)) {
          expect(planRank[id]).toBeLessThan(tierRank);
        }
      }
    }
  });

  it('keeps org.multi-center as the only premium-intended gated feature (SOU-83)', () => {
    expect(FEATURE_TIER['org.multi-center']).toBe('premium');
    expect(minimumPlanFor('org.multi-center')).toBe('premium');
  });
});

describe('minimumPlanFor', () => {
  it('returns the mapped tier for a flag', () => {
    expect(minimumPlanFor('core.students')).toBe('essentiel');
    expect(minimumPlanFor('payroll.teacher')).toBe('pro');
    expect(minimumPlanFor('dashboard.advanced')).toBe('premium');
  });

  it('agrees with FEATURE_TIER for every flag', () => {
    for (const flag of allFlags) {
      expect(minimumPlanFor(flag)).toBe(FEATURE_TIER[flag]);
    }
  });
});
