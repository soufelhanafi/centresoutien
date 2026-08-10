import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import { activeOverrideOn } from '../policies/center-hours-override-policy';

export type GetActiveCenterHoursOverrideInput = {
  centerCode: CenterCode;
  /** The civil date (`YYYY-MM-DD`) to resolve the effective override for. */
  date: string;
};

/**
 * Resolves the single center-hours override in effect on one date (SOU-165), or
 * `null` when none covers it. Gated by `settings.center-hours`. When several live
 * overrides overlap the date (an editing accident), the one with the greatest id
 * wins — see {@link activeOverrideOn} for why that is deterministic across synced
 * devices. Backs the renderer's per-day "which hours apply today" read.
 */
export class GetActiveCenterHoursOverride {
  constructor(
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetActiveCenterHoursOverrideInput): Promise<CenterHoursOverride | null> {
    this.plan.require('settings.center-hours');
    const covering = await this.overrides.listOverlapping(input.centerCode, input.date, input.date);
    return activeOverrideOn(input.date, covering);
  }
}
