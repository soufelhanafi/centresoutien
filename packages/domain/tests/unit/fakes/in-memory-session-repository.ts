import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { Session, SessionId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { SessionRepository } from '../../../src/ports/session-repository';

/**
 * In-memory {@link SessionRepository} for unit tests and the contract SOU-129
 * implements. Reuses the shared soft-delete base (tombstone-excluding reads,
 * soft delete, no hard delete) and adds the one recurrence read, upholding the
 * port's `date` ordering so callers never re-sort.
 */
export class InMemorySessionRepository
  extends InMemorySoftDeletableRepository<SessionId, Session>
  implements SessionRepository
{
  async listForRecurrence(
    recurringSessionId: WeeklyRecurringSessionId,
  ): Promise<readonly Session[]> {
    return [...this.rows.values()]
      .filter((row) => row.deletedAt === null && row.recurringSessionId === recurringSessionId)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => structuredClone(row));
  }
}
