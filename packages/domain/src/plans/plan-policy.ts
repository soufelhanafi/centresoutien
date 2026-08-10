import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../errors/plan-errors';
import type { FeatureFlag, Plan, PlanId, PlanLimits } from './plans';

/**
 * The one enforcement surface for plan gating (CLAUDE.md §4). Every gated use
 * case calls `require()` at its top; every limited write calls
 * `requireBelowLimit()`. No plan conditionals live anywhere else.
 */
export class PlanPolicy {
  constructor(private plan: Plan) {}

  /**
   * Swaps the active plan in place. The dev plan switcher — and, later, a
   * license refresh — routes through here so this policy stays the single
   * authoritative gate; the renderer's plan store is only a cosmetic mirror
   * (CLAUDE.md §4). Without this the UI could flip a feature on while the domain
   * still rejects it, and every gated read would throw PlanFeatureUnavailableError.
   */
  setActivePlan(plan: Plan): void {
    this.plan = plan;
  }

  activePlanId(): PlanId {
    return this.plan.id;
  }

  activeFeatures(): readonly FeatureFlag[] {
    return [...this.plan.features];
  }

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
