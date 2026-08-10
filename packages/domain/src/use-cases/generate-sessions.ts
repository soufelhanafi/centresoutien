import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { HolidayOccurrence } from '../policies/holiday-policy';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import type { TimeWindow } from '../value-objects/time-window';
import type { WeeklyRecurringSession } from '../entities/weekly-recurring-session';
import { newEnvelope } from '../entities/envelope';
import { eachDateInRange, weekdayOf } from '../value-objects/date-range';
import { holidayOn } from '../policies/holiday-policy';
import { activeOverrideOn } from '../policies/center-hours-override-policy';
import { windowsForWeekday } from '../entities/center-hours-override';
import { timeWindowsContain } from '../value-objects/time-window';
import {
  GENERATION_BATCH_ID_PREFIX,
  SESSION_ID_PREFIX,
  type GenerationBatchId,
  type Session,
  type SessionId,
} from '../entities/session';

export type GenerateSessionsInput = {
  /** The template to materialize; supplies room, teacher, weekday, time range, and `centerCode`. */
  recurring: WeeklyRecurringSession;
  /** Holidays to skip (fixed + lunar). Already scoped to the center by the caller. */
  holidays: readonly HolidayOccurrence[];
  /** Inclusive `[start, end]` window to materialize. */
  range: DateRange;
  /** Machine running the generation — the `deviceOrigin` of the fresh Session rows. */
  deviceOrigin: DeviceId;
  /** User running the generation — the `updatedBy` of the fresh rows. */
  updatedBy: UserId;
  /**
   * Dates (SOU-161) the caller has explicitly chosen to materialize *despite*
   * falling on a holiday — the "unless explicitly overridden" carve-out. Every
   * other holiday date is still skipped. Defaults to none: without this, every
   * holiday date is skipped, exactly as before this field existed.
   */
  overrideHolidayDates?: readonly string[];
  /**
   * Active center-hours overrides (SOU-165), already scoped to the center by the
   * caller. On a date an override covers, the template's fixed `[start, end]` must
   * fit entirely inside one of that weekday's override windows or the date is
   * skipped and reported in `skippedOutsideHours`. Dates no override covers are
   * never hours-checked here (the template already passed static-hours validation
   * at creation, or was intentionally forced), so this defaults to none and, when
   * empty, reproduces the pre-SOU-165 behavior exactly.
   */
  overrides?: readonly CenterHoursOverride[];
};

/** One date the run would have materialized if it weren't a holiday. */
export type SkippedHolidayOccurrence = {
  readonly date: string;
  readonly holiday: HolidayOccurrence;
};

/**
 * One date an active override forced to be skipped because the template's fixed
 * time range no longer fits any of that weekday's override windows (SOU-165) —
 * e.g. a 17:00–19:00 slot during a Ramadan day that only opens 09:00–15:00 and
 * 21:00–23:00. `windows` is that date's effective override windows (empty = the
 * center is closed that day under the override) so a preview can explain the skip
 * and let the admin re-time the slot.
 */
export type SkippedOutsideHoursOccurrence = {
  readonly date: string;
  readonly windows: readonly TimeWindow[];
};

export type GenerateSessionsResult = {
  readonly sessions: readonly Session[];
  /** Every date skipped for falling on a holiday, in ascending date order (SOU-161). */
  readonly skippedHolidays: readonly SkippedHolidayOccurrence[];
  /** Every date skipped for falling outside an active override's windows (SOU-165), ascending. */
  readonly skippedOutsideHours: readonly SkippedOutsideHoursOccurrence[];
};

/**
 * Materializes concrete dated {@link Session} rows from a
 * {@link WeeklyRecurringSession} template over a date range, skipping any date
 * that falls on a Holiday (unless explicitly overridden, see below), any date
 * outside the template's `[validFrom, validTo]` validity window, and every date
 * when the template is paused (`active === false`). Pure and deterministic: it
 * reads no clock or id source of its own — both are injected — and touches no
 * repository, so given the same inputs (and a deterministic `Clock` /
 * `IdGenerator`) it returns the same result every time.
 *
 * Two properties this determinism buys, both covered by the unit tests:
 * - **Holiday skipping never shifts subsequent sessions.** Each session's `date`
 *   is the real calendar date it lands on — dropping a holiday date simply omits
 *   that occurrence; the following ones keep their own dates, never pulled earlier.
 * - **Domain-level idempotency.** Every date appears at most once, so the
 *   `(recurringSessionId, date)` pairs are a set. Re-running over the same window
 *   yields the same pairs; the persistence-level upsert (SOU-129) uses that key to
 *   discard the duplicate rows a re-run's fresh ULIDs would otherwise create.
 *
 * **Holiday override (SOU-161).** A date in `overrideHolidayDates` still
 * materializes a session even though it falls on a holiday — the "unless
 * explicitly overridden" carve-out. Every other holiday date is skipped and
 * reported back in `skippedHolidays` (result, not thrown) so a caller building
 * a preview can show which occurrences were dropped and let the admin build the
 * override list from that.
 *
 * Every occurrence a single `execute()` call materializes shares one fresh
 * {@link GenerationBatchId} (SOU-160), minted once via the injected `ids` before
 * the loop — the tag `UndoGenerationBatch` bulk-cancels by. A natural-key
 * collision at the persistence upsert leaves the stored row's original batch id
 * untouched, so re-running a generator never re-tags already-materialized dates
 * into the new run's batch — only the newly-covered dates carry it.
 *
 * Invoicing is untouched — billing is monthly per subscription, never per
 * session — so a month with a holiday materializes fewer sessions but charges
 * the same.
 *
 * No plan gate here: this is a pure computation, not an entry point. The
 * `core.calendar.week` gate lives at the persistence/IPC seam (SOU-129) that
 * invokes it.
 */
export class GenerateSessions {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(input: GenerateSessionsInput): GenerateSessionsResult {
    const { recurring, holidays, range, overrideHolidayDates = [], overrides: hoursOverrides = [] } = input;
    const overriddenHolidayDates = new Set(overrideHolidayDates);
    const sessions: Session[] = [];
    const skippedHolidays: SkippedHolidayOccurrence[] = [];
    const skippedOutsideHours: SkippedOutsideHoursOccurrence[] = [];
    // A paused template (SOU-52 `active` toggle) materializes nothing — the slot is
    // still on the grid but produces no dated occurrences until it is resumed.
    if (!recurring.active) return { sessions, skippedHolidays, skippedOutsideHours };
    const generationBatchId = this.ids.next(GENERATION_BATCH_ID_PREFIX) as GenerationBatchId;
    for (const date of eachDateInRange(range)) {
      if (weekdayOf(date) !== recurring.dayOfWeek) continue;
      // Skip dates outside the recurrence's validity window (SOU-52). Both bounds
      // are nullable = unbounded; `YYYY-MM-DD` compares lexicographically, so the
      // string comparisons below are chronological.
      if (recurring.validFrom !== null && date < recurring.validFrom) continue;
      if (recurring.validTo !== null && date > recurring.validTo) continue;
      const holiday = holidayOn(date, holidays);
      if (holiday !== null && !overriddenHolidayDates.has(date)) {
        skippedHolidays.push({ date, holiday });
        continue;
      }
      const override = activeOverrideOn(date, hoursOverrides);
      if (override !== null) {
        const windows = windowsForWeekday(override.hoursByWeekday, recurring.dayOfWeek);
        if (!timeWindowsContain(windows, recurring.start, recurring.end)) {
          skippedOutsideHours.push({ date, windows });
          continue;
        }
      }
      sessions.push(this.materialize(recurring, date, input, generationBatchId));
    }
    return { sessions, skippedHolidays, skippedOutsideHours };
  }

  private materialize(
    recurring: WeeklyRecurringSession,
    date: string,
    input: GenerateSessionsInput,
    generationBatchId: GenerationBatchId,
  ): Session {
    return {
      id: this.ids.next(SESSION_ID_PREFIX) as SessionId,
      ...newEnvelope(
        {
          centerCode: recurring.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      recurringSessionId: recurring.id,
      generationBatchId,
      roomId: recurring.roomId,
      teacherId: recurring.teacherId,
      groupId: recurring.groupId,
      date,
      start: recurring.start,
      end: recurring.end,
    };
  }
}
