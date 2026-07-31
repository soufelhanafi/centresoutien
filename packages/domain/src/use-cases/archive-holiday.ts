import type { HolidayRepository } from '../ports/holiday-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { HolidayId } from '../entities/holiday';
import type { CenterCode, UserId } from '../value-objects/ids';
import { HolidayNotFoundError } from '../errors/holiday-errors';

export type ArchiveHolidayInput = {
  centerCode: CenterCode;
  holidayId: HolidayId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a Holiday. Gated by `settings.holidays`. The target is
 * center-scoped: the holiday is loaded first, and an unknown, already-archived, or
 * foreign-center id raises a typed {@link HolidayNotFoundError} before anything is
 * touched — so a stale or wrong-tenant id from the renderer can never silently
 * no-op as a success (mirrors `ArchiveRoom`).
 *
 * A holiday is not referenced by any other entity (sessions carry their own dates,
 * not a holiday id), so there is no in-use guard. When found it is soft-deleted
 * (tombstone), never hard-deleted, so the row still syncs. The delete timestamp
 * comes from the injected `Clock` (UTC), and the deleter's `updatedBy` is stamped
 * on the tombstone so a delete-vs-edit conflict can show *who* archived, not just
 * when.
 */
export class ArchiveHoliday {
  constructor(
    private readonly holidays: HolidayRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveHolidayInput): Promise<void> {
    this.plan.require('settings.holidays');

    const existing = await this.holidays.findById(input.holidayId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new HolidayNotFoundError(input.holidayId);
    }

    await this.holidays.softDelete(input.holidayId, this.clock.now(), input.updatedBy);
  }
}
