import type { FeatureFlag } from '@centresoutien/domain';
import { usePlanStore } from '../stores/plan-store';

/**
 * True when the active plan includes `flag`. Components gate on feature flags,
 * never on plan names (CLAUDE.md §4) — so moving a feature between tiers is a
 * one-line change in the domain's plans registry.
 */
export function useFeature(flag: FeatureFlag): boolean {
  return usePlanStore((state) => state.plan.features.has(flag));
}

/**
 * Same as `useFeature`, but `flag` may be `undefined` for an ungated module —
 * in that case this returns `true`. Lets call sites drop the
 * `useFeature(module.feature ?? 'core.students')` sentinel.
 */
export function useOptionalFeature(flag?: FeatureFlag): boolean {
  return usePlanStore((state) => flag === undefined || state.plan.features.has(flag));
}
