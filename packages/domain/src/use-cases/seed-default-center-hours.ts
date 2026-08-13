import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeekdayIndex } from '../value-objects/weekday';
import { newEnvelope } from '../entities/envelope';
import { DEFAULT_WEEKLY_HOURS } from '../schemas/center-hours';
import {
  CENTER_HOURS_ID_PREFIX,
  type CenterHours,
  type CenterHoursId,
} from '../entities/center-hours';

export type SeedDefaultCenterHoursInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/** Builds the initial week so it can be committed with the center atomically. */
export function newDefaultCenterHours(
  input: SeedDefaultCenterHoursInput,
  clock: Clock,
  ids: IdGenerator,
): readonly CenterHours[] {
  return DEFAULT_WEEKLY_HOURS.map((day) => {
    const windows: readonly TimeWindow[] = day.windows.map((window) => ({
      open: window.open as TimeOfDay,
      close: window.close as TimeOfDay,
    }));
    return {
      id: ids.next(CENTER_HOURS_ID_PREFIX) as CenterHoursId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        clock,
      ),
      dayOfWeek: day.dayOfWeek as WeekdayIndex,
      windows,
    };
  });
}

/**
 * Persists {@link DEFAULT_WEEKLY_HOURS} as a center's initial seven CenterHours
 * rows the first time the center exists (SOU-235). Without this a fresh center
 * has zero saved rows, and `SessionConflictPolicy.withinCenterHours` reads every
 * weekday as closed — nothing can be scheduled until the admin visits Settings.
 * Persisting real rows (rather than a renderer-side seed or a silent
 * scheduling-time default) keeps the week editable in Settings and sync-safe.
 *
 * Idempotent: a center that already has any live hours row is left untouched, so
 * a re-run at creation, a profile re-save, or an already-configured center never
 * duplicates or overwrites. No plan gate — seeding runs during the unlicensed
 * first-run bootstrap (before an admin or license exists), and `settings.center-hours`
 * is an every-plan feature regardless.
 */
export class SeedDefaultCenterHours {
  constructor(
    private readonly hours: CenterHoursRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: SeedDefaultCenterHoursInput): Promise<readonly CenterHours[]> {
    const existing = await this.hours.listForCenter(input.centerCode);
    if (existing.length > 0) return existing;

    const seeded = newDefaultCenterHours(input, this.clock, this.ids);
    for (const row of seeded) await this.hours.save(row);
    return seeded;
  }
}
