import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { WeeklyRecurringSessionNotFoundError } from '../errors/scheduling-errors';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';

export type CancelWeeklyRecurringSessionInput = {
  centerCode: CenterCode;
  id: WeeklyRecurringSessionId;
  updatedBy: UserId;
};

/**
 * Cancels (unschedules) a weekly recurring session. Gated by `core.calendar.week`.
 * **Soft delete only**: it sets `deletedAt`/`updatedAt` and records `updatedBy`
 * (who cancelled — needed for the delete-vs-edit conflict UI), never a hard
 * `DELETE`; the tombstoned row still syncs, and the concrete-session generator
 * (SOU-56) skips a template once it is inactive/removed.
 *
 * Unknown, already-cancelled, or foreign-center ids raise
 * {@link WeeklyRecurringSessionNotFoundError} rather than silently no-op'ing, so a
 * stale renderer id can never masquerade as success (mirrors `enrollment.unenroll`,
 * not the idempotent `*.archive` boundary swallow). The timestamp comes from the
 * injected `Clock`, always UTC.
 */
export class CancelWeeklyRecurringSession {
  constructor(
    private readonly sessions: WeeklyRecurringSessionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CancelWeeklyRecurringSessionInput): Promise<void> {
    this.plan.require('core.calendar.week');

    const existing = await this.sessions.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new WeeklyRecurringSessionNotFoundError(input.id);
    }

    await this.sessions.softDelete(input.id, this.clock.now(), input.updatedBy);
  }
}
