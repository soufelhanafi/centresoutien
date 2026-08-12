import type { SessionRepository } from '../ports/session-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { SessionId } from '../entities/session';
import { SessionNotFoundError } from '../errors/scheduling-errors';

export type CancelSessionInput = {
  centerCode: CenterCode;
  id: SessionId;
  updatedBy: UserId;
};

/**
 * Cancels a single concrete, dated {@link Session} occurrence — the per-occurrence
 * counterpart to {@link CancelWeeklyRecurringSession}, which cancels the whole
 * recurring template. This is what the out-of-effective-hours audit's "Cancel"
 * action calls: it tombstones only the one materialized row the operator picked
 * (e.g. a single session that a new iftar-gap override stranded), leaving the
 * recurring template and its other occurrences untouched.
 *
 * **Soft delete only**: it sets `deletedAt`/`updatedAt` and records `updatedBy`
 * (who cancelled — needed for the delete-vs-edit conflict UI), never a hard
 * `DELETE`; the tombstoned row still syncs, and — because the persistence-level
 * upsert dedups on `(recurringSessionId, date)` and never resurrects a
 * soft-deleted row — re-running the generator will not bring the cancelled
 * occurrence back.
 *
 * Unknown, already-cancelled, or foreign-center ids raise
 * {@link SessionNotFoundError} rather than silently no-op'ing, so a stale renderer
 * id can never masquerade as success (mirrors `CancelWeeklyRecurringSession`, not
 * the idempotent `*.archive` boundary swallow). Gated by `core.calendar.week`, the
 * same flag every other calendar mutation uses. The timestamp comes from the
 * injected `Clock`, always UTC.
 */
export class CancelSession {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CancelSessionInput): Promise<void> {
    this.plan.require('core.calendar.week');

    const existing = await this.sessions.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new SessionNotFoundError(input.id);
    }

    await this.sessions.softDelete(input.id, this.clock.now(), input.updatedBy);
  }
}
