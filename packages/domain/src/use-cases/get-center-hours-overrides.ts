import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { CenterHoursOverride } from '../entities/center-hours-override';

export type GetCenterHoursOverridesInput = {
  centerCode: CenterCode;
  /**
   * When set, returns only overrides whose inclusive date range intersects this
   * window — the session generator and the calendar pass the range they render.
   * When omitted, returns every live override for the center (the Settings list).
   */
  range?: DateRange;
};

/**
 * Reads a center's live center-hours overrides (SOU-165), ordered by range start
 * then id. Gated by `settings.center-hours`. With a `range`, only overrides that
 * intersect it are returned (the generator's need); without one, the whole live
 * list is returned (the Settings screen). Returns only persisted rows — never
 * synthesizes an override — and excludes tombstones.
 */
export class GetCenterHoursOverrides {
  constructor(
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetCenterHoursOverridesInput): Promise<readonly CenterHoursOverride[]> {
    this.plan.require('settings.center-hours');
    if (input.range === undefined) return this.overrides.listForCenter(input.centerCode);
    return this.overrides.listOverlapping(input.centerCode, input.range.start, input.range.end);
  }
}
