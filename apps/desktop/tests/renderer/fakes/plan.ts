import { PLANS, type FeatureFlag, type Plan } from '@centresoutien/domain';

/**
 * A plan that grants every feature (with unlimited limits) except the given flags.
 *
 * Since the SOU-83 MVP tier collapse, the live tiers grant almost every flag, so a
 * real `PLANS.essentiel` no longer locks anything a gating test can observe. These
 * synthetic plans keep the locked-UI paths (FeatureGate, sidebar, dashboard) tested
 * independently of the live tier configuration.
 */
export function planWithout(...flags: readonly FeatureFlag[]): Plan {
  const dropped = new Set<FeatureFlag>(flags);
  return {
    ...PLANS.premium,
    features: new Set([...PLANS.premium.features].filter((flag) => !dropped.has(flag))),
  };
}
