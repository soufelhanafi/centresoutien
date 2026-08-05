import { PLANS, type FeatureFlag, type Plan, type PlanLimits } from '../../../src/plans/plans';

const UNLIMITED: PlanLimits = {
  maxStudents: 'unlimited',
  maxTeachers: 'unlimited',
  maxRooms: 'unlimited',
};

/**
 * A plan that grants every feature except `flag`, with unlimited limits.
 *
 * Since the SOU-83 MVP tier collapse, no real tier locks the feature flags a
 * use case gates on, so the gate's negative path is unreachable through `PLANS`.
 * These synthetic plans keep that path — and its coverage — exercised
 * independently of the live tier configuration.
 */
export function planWithoutFeature(flag: FeatureFlag): Plan {
  return {
    id: 'essentiel',
    features: new Set([...PLANS.premium.features].filter((f) => f !== flag)),
    limits: UNLIMITED,
  };
}

/** A plan that grants every feature but caps a limit — keeps limit gates testable. */
export function planWithLimits(limits: Partial<PlanLimits>): Plan {
  return {
    id: 'essentiel',
    features: new Set(PLANS.premium.features),
    limits: { ...UNLIMITED, ...limits },
  };
}
