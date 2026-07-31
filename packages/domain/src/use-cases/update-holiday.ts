import type { HolidayRepository } from '../ports/holiday-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { holidayInputSchema, type HolidayInput } from '../schemas/holiday';
import { HolidayNotFoundError } from '../errors/holiday-errors';
import type { Holiday, HolidayId } from '../entities/holiday';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateHolidayInput = HolidayInput & {
  centerCode: CenterCode;
  id: HolidayId;
  updatedBy: UserId;
};

/**
 * Edits a holiday's user-facing fields (name, kind, date range). Gated by
 * `settings.holidays`. Validates with the shared `holidayInputSchema` so the
 * calendar-date and `end-before-start` invariants hold here too, not just in the
 * form.
 *
 * Identity and provenance are preserved: `id`, `centerCode`, `deviceOrigin`,
 * `createdAt`, and `version` are never touched — `version` is the hub's to assign,
 * so a local edit must not bump it. The write goes through `applyWrite`, which
 * advances `updatedAt` (from the Clock port) and `updatedBy` and records the
 * changed field names **only when something actually changed** — a no-op edit
 * returns the row untouched and emits no spurious sync delta. Unknown, archived, or
 * foreign-center ids raise {@link HolidayNotFoundError} rather than inserting a new
 * row.
 */
export class UpdateHoliday {
  constructor(
    private readonly holidays: HolidayRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateHolidayInput): Promise<Holiday> {
    this.plan.require('settings.holidays');
    const { name, kind, startDate, endDate } = holidayInputSchema.parse({
      name: input.name,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const existing = await this.holidays.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new HolidayNotFoundError(input.id);
    }

    const { next, changedFields } = applyWrite(
      existing,
      { name, kind, startDate, endDate },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.holidays.save(next);
    }
    return next;
  }
}
