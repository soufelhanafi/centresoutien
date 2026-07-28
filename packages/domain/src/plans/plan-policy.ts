import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../errors/plan-errors';
import type { FeatureFlag, Plan, PlanLimits } from './plans';

/**
 * The one enforcement surface for plan gating (CLAUDE.md §4). Every gated use
 * case calls `require()` at its top; every limited write calls
 * `requireBelowLimit()`. No plan conditionals live anywhere else.
 */
export class PlanPolicy {
  constructor(private readonly plan: Plan) {}

  has(feature: FeatureFlag): boolean {
    return this.plan.features.has(feature);
  }

  require(feature: FeatureFlag): void {
    if (!this.has(feature)) {
      throw new PlanFeatureUnavailableError(feature, this.plan.id);
    }
  }

  limit<K extends keyof PlanLimits>(key: K): PlanLimits[K] {
    return this.plan.limits[key];
  }

  requireBelowLimit(key: keyof PlanLimits, current: number): void {
    const cap = this.limit(key);
    if (cap === 'unlimited') return;
    if (current >= cap) {
      throw new PlanLimitExceededError(key, cap, current);
    }
  }
}
