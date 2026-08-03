import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { HolidayOccurrence } from '../policies/holiday-policy';
import type { WeeklyRecurringSession } from '../entities/weekly-recurring-session';
import { newEnvelope } from '../entities/envelope';
import { eachDateInRange, weekdayOf } from '../value-objects/date-range';
import { holidayOn } from '../policies/holiday-policy';
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
};

/**
 * Materializes concrete dated {@link Session} rows from a
 * {@link WeeklyRecurringSession} template over a date range, skipping any date
 * that falls on a Holiday, any date outside the template's `[validFrom, validTo]`
 * validity window, and every date when the template is paused (`active === false`).
 * Pure and deterministic: it reads no clock or id
 * source of its own — both are injected — and touches no repository, so given
 * the same inputs (and a deterministic `Clock` / `IdGenerator`) it returns the
 * same set every time.
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

  execute(input: GenerateSessionsInput): readonly Session[] {
    const { recurring, holidays, range } = input;
    const sessions: Session[] = [];
    // A paused template (SOU-52 `active` toggle) materializes nothing — the slot is
    // still on the grid but produces no dated occurrences until it is resumed.
    if (!recurring.active) return sessions;
    const generationBatchId = this.ids.next(GENERATION_BATCH_ID_PREFIX) as GenerationBatchId;
    for (const date of eachDateInRange(range)) {
      if (weekdayOf(date) !== recurring.dayOfWeek) continue;
      // Skip dates outside the recurrence's validity window (SOU-52). Both bounds
      // are nullable = unbounded; `YYYY-MM-DD` compares lexicographically, so the
      // string comparisons below are chronological.
      if (recurring.validFrom !== null && date < recurring.validFrom) continue;
      if (recurring.validTo !== null && date > recurring.validTo) continue;
      if (holidayOn(date, holidays) !== null) continue;
      sessions.push(this.materialize(recurring, date, input, generationBatchId));
    }
    return sessions;
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
