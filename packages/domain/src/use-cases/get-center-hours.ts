import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { CenterHours } from '../entities/center-hours';

export type GetCenterHoursInput = {
  centerCode: CenterCode;
};

/**
 * Reads a center's saved weekly hours (CLAUDE.md §6). Gated by
 * `settings.center-hours`. Returns only the persisted live rows, ordered by
 * weekday — possibly empty for a fresh center. The renderer seeds an empty
 * result from the domain's `DEFAULT_WEEKLY_HOURS`; it never synthesizes entities.
 */
export class GetCenterHours {
  constructor(
    private readonly hours: CenterHoursRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetCenterHoursInput): Promise<readonly CenterHours[]> {
    this.plan.require('settings.center-hours');
    return this.hours.listForCenter(input.centerCode);
  }
}
