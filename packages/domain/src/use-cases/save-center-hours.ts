import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';
import { newEnvelope } from '../entities/envelope';
import { applyWrite } from '../entities/write';
import { weeklyHoursSchema, type WeeklyHoursInput } from '../schemas/center-hours';
import {
  CENTER_HOURS_ID_PREFIX,
  type CenterHours,
  type CenterHoursId,
} from '../entities/center-hours';

export type SaveCenterHoursInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  week: WeeklyHoursInput;
};

/**
 * Upserts a center's weekly opening hours (CLAUDE.md §6). Gated by
 * `settings.center-hours` (present on every plan; the guard still has one home).
 * Each weekday is an independent, independently-versioned row: a first save
 * creates all seven; later saves touch only the days that actually changed —
 * `applyWrite` returns a no-op for unchanged days, so `updatedAt`/`version` never
 * bump spuriously and sync stays quiet (invariant 5).
 */
export class SaveCenterHours {
  constructor(
    private readonly hours: CenterHoursRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SaveCenterHoursInput): Promise<readonly CenterHours[]> {
    this.plan.require('settings.center-hours');
    const week = weeklyHoursSchema.parse(input.week);

    const saved: CenterHours[] = [];
    for (const day of week) {
      const dayOfWeek = day.dayOfWeek as WeekdayIndex;
      const windows: readonly TimeWindow[] = day.windows.map((window) => ({
        open: window.open as TimeOfDay,
        close: window.close as TimeOfDay,
      }));

      const existing = await this.hours.findByDay(input.centerCode, dayOfWeek);
      if (existing === null) {
        const created: CenterHours = {
          id: this.ids.next(CENTER_HOURS_ID_PREFIX) as CenterHoursId,
          ...newEnvelope(
            {
              centerCode: input.centerCode,
              deviceOrigin: input.deviceOrigin,
              updatedBy: input.updatedBy,
            },
            this.clock,
          ),
          dayOfWeek,
          windows,
        };
        await this.hours.save(created);
        saved.push(created);
        continue;
      }

      const { next, changedFields } = applyWrite(
        existing,
        { windows },
        { clock: this.clock, updatedBy: input.updatedBy },
      );
      if (changedFields.length > 0) {
        await this.hours.save(next);
      }
      saved.push(next);
    }

    return saved;
  }
}
