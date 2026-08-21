import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { Session, SessionId, GenerationBatchId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { SessionRepository } from '../../../src/ports/session-repository';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { DateRange } from '../../../src/value-objects/date-range';

/**
 * In-memory {@link SessionRepository} for unit tests. Reuses the shared
 * soft-delete base (tombstone-excluding reads, soft delete, no hard delete) and
 * upholds the port's idempotency contract: {@link upsertMany} dedups on the
 * natural key `(recurringSessionId, date)` — a collision leaves the stored row
 * (id, envelope, tombstone) untouched, matching the SQLite adapter's
 * `ON CONFLICT(recurring_session_id, date) DO NOTHING`. Reads honor the port's
 * `date` ordering so callers never re-sort.
 */
export class InMemorySessionRepository
  extends InMemorySoftDeletableRepository<SessionId, Session>
  implements SessionRepository
{
  private hasNaturalKey(recurringSessionId: WeeklyRecurringSessionId, date: string): boolean {
    return [...this.rows.values()].some(
      (row) => row.recurringSessionId === recurringSessionId && row.date === date,
    );
  }

  async upsertMany(sessions: readonly Session[]): Promise<void> {
    for (const session of sessions) {
      // Natural-key collision → keep the stored row untouched (id, envelope,
      // tombstone). Only a never-materialized (recurringSessionId, date) inserts.
      if (this.hasNaturalKey(session.recurringSessionId, session.date)) continue;
      this.rows.set(session.id, structuredClone(session));
    }
  }

  async listForRecurrence(
    recurringSessionId: WeeklyRecurringSessionId,
  ): Promise<readonly Session[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.recurringSessionId === recurringSessionId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => structuredClone(row));
  }

  async listForRange(
    centerCode: CenterCode,
    range: DateRange,
  ): Promise<readonly Session[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.centerCode === centerCode &&
          range.start <= row.date &&
          row.date <= range.end,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .map((row) => structuredClone(row));
  }

  async listLiveFrom(
    centerCode: CenterCode,
    cutoffDate: string,
  ): Promise<readonly Session[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.deletedAt === null && row.centerCode === centerCode && row.date >= cutoffDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .map((row) => structuredClone(row));
  }

  async listByGenerationBatch(
    centerCode: CenterCode,
    batchId: GenerationBatchId,
  ): Promise<readonly Session[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.centerCode === centerCode &&
          row.generationBatchId === batchId,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      .map((row) => structuredClone(row));
  }
}
