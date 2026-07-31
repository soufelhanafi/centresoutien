import type { HolidayRepository } from '../ports/holiday-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { HolidayNotFoundError } from '../errors/holiday-errors';
import type { Holiday, HolidayId } from '../entities/holiday';
import type { CenterCode, UserId } from '../value-objects/ids';

export type RestoreHolidayInput = {
  centerCode: CenterCode;
  holidayId: HolidayId;
  updatedBy: UserId;
};

/**
 * Restores an archived holiday — clears its tombstone (`deletedAt = null`) so it
 * returns to the live list. Gated by `settings.holidays`. The target is read via
 * `findArchivedById` (the only path that sees tombstones), and an unknown,
 * already-live, or foreign-center id raises {@link HolidayNotFoundError} before
 * anything is touched.
 *
 * Holidays have no plan limit, so restore has no count check (unlike `RestoreRoom`).
 * The clear-and-save reuses the ordinary write path: `updatedAt` (from the Clock
 * port, UTC) and `updatedBy` advance; `version` stays the hub's to assign; the id,
 * provenance, and `createdAt` are preserved.
 */
export class RestoreHoliday {
  constructor(
    private readonly holidays: HolidayRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RestoreHolidayInput): Promise<Holiday> {
    this.plan.require('settings.holidays');

    const archived = await this.holidays.findArchivedById(input.holidayId);
    if (archived === null || archived.centerCode !== input.centerCode) {
      throw new HolidayNotFoundError(input.holidayId);
    }

    const restored: Holiday = {
      ...archived,
      deletedAt: null,
      updatedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    };
    await this.holidays.save(restored);
    return restored;
  }
}
