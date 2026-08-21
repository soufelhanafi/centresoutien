import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import { toScheduledSessionRef } from '../../../src/entities/weekly-recurring-session';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { WeeklyRecurringSessionRepository } from '../../../src/ports/weekly-recurring-session-repository';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { GroupId } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import { toMinutes } from '../../../src/value-objects/time-of-day';

/**
 * In-memory {@link WeeklyRecurringSessionRepository} for use-case unit tests.
 * Reuses the shared soft-delete base (tombstone-excluding reads, soft delete, no
 * hard delete) and adds the scheduling + seat-fit reads, upholding the port's
 * ordering contract — weekday then start time — so the use case never has to
 * re-sort and the fake matches what the SQLite adapter's indexes serve.
 */
export class InMemoryWeeklyRecurringSessionRepository
  extends InMemorySoftDeletableRepository<WeeklyRecurringSessionId, WeeklyRecurringSession>
  implements WeeklyRecurringSessionRepository
{
  private live(centerCode: CenterCode): WeeklyRecurringSession[] {
    return [...this.rows.values()].filter(
      (row) => row.deletedAt === null && row.centerCode === centerCode,
    );
  }

  async listRefsForDay(
    centerCode: CenterCode,
    dayOfWeek: WeekdayIndex,
  ): Promise<readonly ScheduledSessionRef[]> {
    return this.live(centerCode)
      .filter((row) => row.dayOfWeek === dayOfWeek)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      .map(toScheduledSessionRef);
  }

  async listActiveByGroupId(
    centerCode: CenterCode,
    groupId: GroupId,
  ): Promise<readonly WeeklyRecurringSession[]> {
    return this.live(centerCode).filter((row) => row.groupId === groupId);
  }

  async listActiveByRoomId(
    centerCode: CenterCode,
    roomId: RoomId,
  ): Promise<readonly WeeklyRecurringSession[]> {
    return this.live(centerCode).filter((row) => row.roomId === roomId);
  }

  async listActive(centerCode: CenterCode): Promise<readonly WeeklyRecurringSession[]> {
    return this.live(centerCode)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || toMinutes(a.start) - toMinutes(b.start))
      .map((row) => structuredClone(row));
  }
}
