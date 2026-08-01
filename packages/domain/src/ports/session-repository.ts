import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Session, SessionId } from '../entities/session';
import type { WeeklyRecurringSessionId } from '../entities/weekly-recurring-session';
import type { CenterCode } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';

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
   * Backs the generator-reconciliation view of a recurrence: which dates are
   * already materialized. The idempotency itself is enforced by {@link upsertMany}
   * at the storage level (a conflict on `(recurringSessionId, date)`), so this
   * read is a query surface, not a precondition of a safe re-run.
   */
  listForRecurrence(
    recurringSessionId: WeeklyRecurringSessionId,
  ): Promise<readonly Session[]>;

  /**
   * Idempotently persist a batch of generated occurrences. The dedup is keyed on
   * the natural identity `(recurringSessionId, date)`, **not** the ULID `id`: the
   * pure generator mints a fresh ULID every run, so re-running it over an
   * overlapping window produces rows that collide on the natural key. On that
   * collision the **already-stored row wins untouched** — its `id`, `createdAt`,
   * and (crucially) `updatedAt` / `version` are preserved, so a re-run writes no
   * change to existing rows and therefore floods the sync feed with nothing. A
   * date the recurrence has never materialized is inserted; a previously
   * soft-deleted (cancelled) occurrence stays cancelled — regeneration never
   * resurrects it. New dates only ever grow the set.
   */
  upsertMany(sessions: readonly Session[]): Promise<void>;

  /**
   * Live (non-tombstoned) occurrences of a center whose `date` falls in the
   * inclusive `[range.start, range.end]` civil-date window, ordered by `date`
   * then `start` — the calendar/day read. The {@link DateRange} carries strict
   * `YYYY-MM-DD` bounds, compared lexicographically (= chronologically). Scoped
   * to one center; never crosses a tenant boundary.
   */
  listForRange(
    centerCode: CenterCode,
    range: DateRange,
  ): Promise<readonly Session[]>;
}
