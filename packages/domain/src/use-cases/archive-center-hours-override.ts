import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { CenterHoursOverrideId } from '../entities/center-hours-override';
import { CenterHoursOverrideNotFoundError } from '../errors/center-hours-override-errors';

export type ArchiveCenterHoursOverrideInput = {
  centerCode: CenterCode;
  overrideId: CenterHoursOverrideId;
  updatedBy: UserId;
};

/**
 * Soft-deletes a center-hours override (SOU-165) — sets `deletedAt`/`updatedAt`
 * from the injected {@link Clock} and records `updatedBy`, never a hard delete.
 * Gated by `settings.center-hours`. The row is loaded and its `centerCode`
 * checked against the request so one center can never archive another's override;
 * an unknown, already-tombstoned, or foreign-center id throws
 * {@link CenterHoursOverrideNotFoundError} rather than silently no-opping.
 */
export class ArchiveCenterHoursOverride {
  constructor(
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveCenterHoursOverrideInput): Promise<void> {
    this.plan.require('settings.center-hours');
    const existing = await this.overrides.findById(input.overrideId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new CenterHoursOverrideNotFoundError(input.overrideId);
    }
    await this.overrides.softDelete(input.overrideId, this.clock.now(), input.updatedBy);
  }
}
