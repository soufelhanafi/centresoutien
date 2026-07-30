import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../entities/weekly-recurring-session';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { CenterCode } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';

/**
 * Persistence port for weekly recurring sessions. Extends the soft-deletable
 * surface (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the two reads the scheduling features need:
 *
 * - {@link listRefsForDay} feeds the composite conflict detector (SOU-55). It
 *   returns already-scoped {@link ScheduledSessionRef}s (same center, alive, that
 *   weekday) so the pure `SessionConflictPolicy` can consume them directly without
 *   re-scoping — the `(day_of_week, room_id)` / `(day_of_week, teacher_id)` indexes
 *   serve it in <10ms on the ~500-row datasets a center produces.
 * - {@link listForWeek} feeds the planner grid (SOU-54): every live session of the
 *   center, across all seven weekdays, as full entities to render.
 *
 * Sessions are identified by their relationships, not people-like matching, so
 * there is no `findByNaturalKey`. The SQLite adapter also satisfies the
 * `RoomReferencePort` the `ArchiveRoom` in-use guard depends on.
 */
export interface WeeklyRecurringSessionRepository
  extends SoftDeletableRepository<WeeklyRecurringSessionId, WeeklyRecurringSession> {
  /**
   * Active (non-tombstoned) sessions of one center on one weekday, projected to
   * conflict refs. Pre-scoped and safe to hand straight to the conflict policy.
   */
  listRefsForDay(
    centerCode: CenterCode,
    dayOfWeek: WeekdayIndex,
  ): Promise<readonly ScheduledSessionRef[]>;
  /**
   * Every active (non-tombstoned) session of the center, ordered by weekday then
   * start time — the full week the planner grid renders.
   */
  listForWeek(centerCode: CenterCode): Promise<readonly WeeklyRecurringSession[]>;
}
