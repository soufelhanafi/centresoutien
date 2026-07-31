import type { HolidayRepository } from '../ports/holiday-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { holidayInputSchema, type HolidayInput } from '../schemas/holiday';
import { HOLIDAY_ID_PREFIX, type Holiday, type HolidayId } from '../entities/holiday';

export type CreateHolidayInput = HolidayInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Holiday for a center. Gated by `settings.holidays` (every plan since
 * SOU-30; the guard is still explicit so the check has one home). Validates its
 * input with the shared `holidayInputSchema`, which carries the calendar-date and
 * `end-before-start` invariants — the domain is the authority even though the form
 * validates first. `affectsInvoicing` is forced `false` (holidays never change
 * billing); there is no plan limit on holidays.
 */
export class CreateHoliday {
  constructor(
    private readonly holidays: HolidayRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateHolidayInput): Promise<Holiday> {
    this.plan.require('settings.holidays');
    const { name, kind, startDate, endDate } = holidayInputSchema.parse({
      name: input.name,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const holiday: Holiday = {
      id: this.ids.next(HOLIDAY_ID_PREFIX) as HolidayId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name,
      kind,
      startDate,
      endDate,
      affectsInvoicing: false,
    };

    await this.holidays.save(holiday);
    return holiday;
  }
}
