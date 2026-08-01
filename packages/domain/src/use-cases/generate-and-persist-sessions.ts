import type { SessionRepository } from '../ports/session-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { GenerateSessions } from './generate-sessions';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { Session } from '../entities/session';
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
 * resurrected. The use case returns the **persisted truth** — a
 * {@link SessionRepository.listForRange} read of the window after the upsert —
 * not the generator output: `generated` carries fresh ULIDs for already-stored
 * dates (which the natural-key upsert discards) and includes soft-deleted
 * occurrences the generator can't see are cancelled. The read gives real stored
 * ids with tombstones excluded.
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
    private readonly generator: GenerateSessions,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GenerateAndPersistSessionsInput): Promise<readonly Session[]> {
    this.plan.require('core.calendar.week');

    const recurring = await this.recurrences.findById(input.recurringSessionId);
    if (recurring === null || recurring.centerCode !== input.centerCode) {
      throw new WeeklyRecurringSessionNotFoundError(input.recurringSessionId);
    }

    const holidays = await this.holidays.listActive(input.centerCode);
    const generated = this.generator.execute({
      recurring,
      holidays,
      range: input.range,
      deviceOrigin: input.deviceOrigin,
      updatedBy: input.updatedBy,
    });

    await this.sessions.upsertMany(generated);
    return this.sessions.listForRange(input.centerCode, input.range); // persisted truth: real ids, tombstones excluded
  }
}
