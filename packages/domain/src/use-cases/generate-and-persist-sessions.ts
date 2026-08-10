import type { SessionRepository } from '../ports/session-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type {
  GenerateSessions,
  SkippedHolidayOccurrence,
  SkippedOutsideHoursOccurrence,
} from './generate-sessions';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { GenerationBatchId, Session } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import { WeeklyRecurringSessionNotFoundError } from '../errors/scheduling-errors';

export type GenerateAndPersistSessionsInput = {
  /** Tenant the recurrence must belong to; the generated rows carry it too. */
  centerCode: CenterCode;
  /** Which recurrence template to materialize. */
  recurringSessionId: WeeklyRecurringSessionId;
  /** Inclusive `[start, end]` window to materialize. */
  range: DateRange;
  /** Machine running the generation — the `deviceOrigin` of the fresh Session rows. */
  deviceOrigin: DeviceId;
  /** User running the generation — the `updatedBy` of the fresh rows. */
  updatedBy: UserId;
  /** Dates to materialize despite falling on a holiday (SOU-161). Defaults to none. */
  overrideHolidayDates?: readonly string[];
};

export type GenerateAndPersistSessionsResult = {
  /**
   * The id this call's own run minted (SOU-160), or `null` if the run
   * materialized nothing (paused template / empty range). `sessions` below is
   * the **persisted window read**, which mixes this id with any older batch
   * ids already stored on pre-existing dates — `generationBatchId` is the only
   * reliable way for a caller to know what THIS call itself just tagged, e.g.
   * to offer "undo this run" right after generating.
   */
  generationBatchId: GenerationBatchId | null;
  /** Persisted truth for the requested window: real stored ids, tombstones excluded. */
  sessions: readonly Session[];
  /** Every date this run skipped for falling on a holiday (SOU-161), straight from the generator. */
  skippedHolidays: readonly SkippedHolidayOccurrence[];
  /** Every date this run skipped for falling outside an active override's windows (SOU-165). */
  skippedOutsideHours: readonly SkippedOutsideHoursOccurrence[];
};

/**
 * The persistence/IPC seam over the pure {@link GenerateSessions} generator: it
 * resolves the recurrence template and the center's holidays, runs the pure
 * generator, and stores the result idempotently. This is where the plan gate
 * lives (`core.calendar.week`) — the generator itself is a pure computation with
 * no entry-point gate, per its own doc.
 *
 * Idempotency is a property of the storage step, not this orchestration: the
 * repository's {@link SessionRepository.upsertMany} dedups on the natural key
 * `(recurringSessionId, date)`, so re-running over an overlapping window inserts
 * only newly-covered dates and writes nothing to rows that already exist — no
 * phantom sync churn, and a cancelled (soft-deleted) occurrence is never
 * resurrected. `sessions` on the result is the **persisted truth** — a
 * {@link SessionRepository.listForRange} read of the window after the upsert —
 * not the generator output: `generated` carries fresh ULIDs for already-stored
 * dates (which the natural-key upsert discards) and includes soft-deleted
 * occurrences the generator can't see are cancelled. The read gives real stored
 * ids with tombstones excluded, but on a re-run it mixes this call's batch id
 * with older ones already on pre-existing dates — that's exactly why
 * `generationBatchId` is returned separately (SOU-160): it is unambiguously
 * *this* call's own tag, straight from the generator, for a caller that wants
 * to offer "undo what I just generated".
 *
 * The template is loaded through `findById` (which hides tombstones) and its
 * `centerCode` is checked against the request, so an unknown, deleted, or
 * foreign-center id is rejected with {@link WeeklyRecurringSessionNotFoundError}
 * rather than silently generating nothing — a stale renderer id can never no-op
 * as success.
 */
export class GenerateAndPersistSessions {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly recurrences: WeeklyRecurringSessionRepository,
    private readonly holidays: HolidayRepository,
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly generator: GenerateSessions,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GenerateAndPersistSessionsInput): Promise<GenerateAndPersistSessionsResult> {
    this.plan.require('core.calendar.week');

    const recurring = await this.recurrences.findById(input.recurringSessionId);
    if (recurring === null || recurring.centerCode !== input.centerCode) {
      throw new WeeklyRecurringSessionNotFoundError(input.recurringSessionId);
    }

    const holidays = await this.holidays.listActive(input.centerCode);
    const overrides = await this.overrides.listOverlapping(
      input.centerCode,
      input.range.start,
      input.range.end,
    );
    const { sessions: generated, skippedHolidays, skippedOutsideHours } = this.generator.execute({
      recurring,
      holidays,
      overrides,
      range: input.range,
      deviceOrigin: input.deviceOrigin,
      updatedBy: input.updatedBy,
      ...(input.overrideHolidayDates !== undefined ? { overrideHolidayDates: input.overrideHolidayDates } : {}),
    });

    await this.sessions.upsertMany(generated);
    // Every element `generated` produces shares one batch id (minted once by
    // the generator before its loop), so the first entry speaks for the run —
    // `null` only when the run made zero occurrences.
    const generationBatchId = generated[0]?.generationBatchId ?? null;
    const sessions = await this.sessions.listForRange(input.centerCode, input.range);
    return { generationBatchId, sessions, skippedHolidays, skippedOutsideHours };
  }
}
