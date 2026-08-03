import type { SessionRepository } from '../ports/session-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import type { GenerationBatchId } from '../entities/session';
import { GenerationBatchNotFoundError } from '../errors/scheduling-errors';

export type UndoGenerationBatchInput = {
  centerCode: CenterCode;
  generationBatchId: GenerationBatchId;
  updatedBy: UserId;
};

export type UndoGenerationBatchResult = {
  /** Sessions soft-deleted by this call. */
  cancelledCount: number;
  /** Sessions in the batch left untouched because their date has already passed. */
  skippedOccurredCount: number;
};

/**
 * Bulk-cancels (soft-deletes) every session one generator run produced
 * (SOU-160), so an admin can undo a misconfigured run without hunting
 * individual rows. Gated by `core.calendar.week` — the same feature that gates
 * generation itself.
 *
 * A session that has already occurred is left alone: "occurred" is a pure
 * civil-date comparison against the injected `Clock` (`session.date < today`),
 * matching the date-only comparisons already used for holidays and overdue
 * invoices elsewhere in the domain — there is no per-center timezone stored to
 * do anything finer. Billing has no per-session concept to guard against
 * either: invoicing is monthly per `StudentSubscription`, never per session
 * (see `generate-sessions.ts`), so a session can never itself be "invoiced".
 *
 * An unknown, foreign-center, or fully-already-cancelled batch id raises
 * {@link GenerationBatchNotFoundError} rather than silently no-op'ing, so a
 * stale renderer id can never masquerade as success (mirrors
 * `weeklySession.delete`).
 */
export class UndoGenerationBatch {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UndoGenerationBatchInput): Promise<UndoGenerationBatchResult> {
    this.plan.require('core.calendar.week');

    const batch = await this.sessions.listByGenerationBatch(
      input.centerCode,
      input.generationBatchId,
    );
    if (batch.length === 0) {
      throw new GenerationBatchNotFoundError(input.generationBatchId);
    }

    const now = this.clock.now();
    const today = now.toISOString().slice(0, 10);

    let cancelledCount = 0;
    let skippedOccurredCount = 0;
    for (const session of batch) {
      if (session.date < today) {
        skippedOccurredCount += 1;
        continue;
      }
      await this.sessions.softDelete(session.id, now, input.updatedBy);
      cancelledCount += 1;
    }

    return { cancelledCount, skippedOccurredCount };
  }
}
