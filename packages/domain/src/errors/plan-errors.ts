import type { FeatureFlag, PlanId, PlanLimits } from '../plans/plans';

/** Base class for all domain errors — carries the concrete subclass name. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when a use case requires a feature the active plan does not include. */
export class PlanFeatureUnavailableError extends DomainError {
  constructor(
    readonly feature: FeatureFlag,
    readonly planId: PlanId,
  ) {
    super(`Feature "${feature}" is not available on the "${planId}" plan.`);
  }
}

/** Thrown when a write would exceed a plan's numeric limit (students, teachers, rooms). */
export class PlanLimitExceededError extends DomainError {
  constructor(
    readonly limitKey: keyof PlanLimits,
    readonly cap: number,
    readonly current: number,
  ) {
    super(`Plan limit "${String(limitKey)}" reached: ${current} of ${cap}.`);
  }
}
