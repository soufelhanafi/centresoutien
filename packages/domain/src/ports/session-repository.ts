import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Session, SessionId } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';

/**
 * Persistence port for materialized {@link Session} occurrences. Extends the
 * soft-deletable surface (`save` / `findById` / `softDelete` / `listChangedSince`;
 * reads exclude tombstones, no hard delete) with the one read the generator's
 * persistence step (SOU-129) needs.
 *
 * **Published contract-first** so SOU-129 can implement the SQLite adapter
 * against this shape while the generator use case is built here. The generator
 * itself is pure and touches no repository — determinism gives it domain-level
 * idempotency; the *persistence-level* dedup (an upsert keyed on
 * `(recurringSessionId, date)`) lives in SOU-129's adapter, reading
 * {@link listForRecurrence} to reconcile the generated set against what's
 * already stored before saving.
 *
 * Sessions are identified by their relationships, not people-like matching, so
 * there is no `findByNaturalKey`.
 */
export interface SessionRepository extends SoftDeletableRepository<SessionId, Session> {
  /**
   * Live (non-tombstoned) occurrences of one recurrence, ordered by `date`.
   * SOU-129's idempotent upsert reads this to skip dates it has already
   * materialized, so re-running the generator over an overlapping window never
   * duplicates a `(recurringSessionId, date)` pair.
   */
  listForRecurrence(
    recurringSessionId: WeeklyRecurringSessionId,
  ): Promise<readonly Session[]>;
}
