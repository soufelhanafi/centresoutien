import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { TimeWindow } from '../value-objects/time-window';
import { newEnvelope } from '../entities/envelope';
import { applyWrite } from '../entities/write';
import { CenterHoursOverrideNotFoundError } from '../errors/center-hours-override-errors';
import {
  centerHoursOverrideInputSchema,
  type CenterHoursOverrideInput,
} from '../schemas/center-hours-override';
import {
  CENTER_HOURS_OVERRIDE_ID_PREFIX,
  type CenterHoursOverride,
  type CenterHoursOverrideId,
  type WeeklyTimeWindows,
} from '../entities/center-hours-override';

export type SaveCenterHoursOverrideInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
  /** Omit to create a fresh override; supply an existing id to edit that one. */
  id?: CenterHoursOverrideId;
} & CenterHoursOverrideInput;

/**
 * Creates or edits a center-hours override (SOU-165). Gated by
 * `settings.center-hours` (present on every plan; the guard still has one home).
 * Validates its input with the shared {@link centerHoursOverrideInputSchema} —
 * shape + the ordered/non-overlapping window invariants; the envelope is minted
 * by the use case, never by the form.
 *
 * With no `id` a new row is created. With an `id`, the live row is loaded and its
 * `centerCode` checked against the request (an unknown, tombstoned, or
 * foreign-center id throws {@link CenterHoursOverrideNotFoundError} rather than
 * silently creating a second row); {@link applyWrite} then bumps `updatedAt` and
 * records the changed fields only when the date range or hours actually change,
 * so re-saving an unchanged override stays sync-quiet (invariant 5). `version` is
 * never touched here — that is the hub's to assign.
 */
export class SaveCenterHoursOverride {
  constructor(
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: SaveCenterHoursOverrideInput): Promise<CenterHoursOverride> {
    this.plan.require('settings.center-hours');
    const fields = centerHoursOverrideInputSchema.parse(input);
    const dateRange: DateRange = { start: fields.dateRange.start, end: fields.dateRange.end };
    const hoursByWeekday = toWeeklyTimeWindows(fields.hoursByWeekday);

    if (input.id === undefined) {
      const created: CenterHoursOverride = {
        id: this.ids.next(CENTER_HOURS_OVERRIDE_ID_PREFIX) as CenterHoursOverrideId,
        ...newEnvelope(
          {
            centerCode: input.centerCode,
            deviceOrigin: input.deviceOrigin,
            updatedBy: input.updatedBy,
          },
          this.clock,
        ),
        dateRange,
        hoursByWeekday,
      };
      await this.overrides.save(created);
      return created;
    }

    const existing = await this.overrides.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new CenterHoursOverrideNotFoundError(input.id);
    }
    const { next, changedFields } = applyWrite(
      existing,
      { dateRange, hoursByWeekday },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) await this.overrides.save(next);
    return next;
  }
}

/** Brand the validated `{ open, close }` window strings into {@link TimeWindow}s. */
function toWindows(
  windows: CenterHoursOverrideInput['hoursByWeekday'][0],
): readonly TimeWindow[] {
  return windows.map(
    (window): TimeWindow => ({ open: window.open as TimeOfDay, close: window.close as TimeOfDay }),
  );
}

/** Brand every weekday's window list, preserving the `0..6` keyed shape. */
function toWeeklyTimeWindows(
  hoursByWeekday: CenterHoursOverrideInput['hoursByWeekday'],
): WeeklyTimeWindows {
  return {
    0: toWindows(hoursByWeekday[0]),
    1: toWindows(hoursByWeekday[1]),
    2: toWindows(hoursByWeekday[2]),
    3: toWindows(hoursByWeekday[3]),
    4: toWindows(hoursByWeekday[4]),
    5: toWindows(hoursByWeekday[5]),
    6: toWindows(hoursByWeekday[6]),
  };
}
