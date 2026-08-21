import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../entities/weekly-recurring-session';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { CenterCode } from '../value-objects/ids';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { GroupId } from '../entities/group';
import type { RoomId } from '../entities/room';

/**
 * Persistence port for weekly recurring sessions. Extends the soft-deletable
 * surface (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the scheduling read the conflict detector needs:
 *
 * - {@link listRefsForDay} feeds the composite conflict detector (SOU-55). It
 *   returns already-scoped {@link ScheduledSessionRef}s (same center, alive, that
 *   weekday) so the pure `SessionConflictPolicy` can consume them directly without
 *   re-scoping — the `(day_of_week, room_id)` / `(day_of_week, teacher_id)` indexes
 *   serve it in <10ms on the ~500-row datasets a center produces.
 *
 * The planner grid's full-week read is **not** here: it needs the enriched
 * cross-aggregate {@link WeeklySessionView} (session ⋈ group ⋈ subject, + room, +
 * teacher), which lives behind its own `WeeklySessionViewReadPort` (SOU-118). The
 * SQLite adapter implements both ports on one class.
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
   * Active sessions bound to one group (SOU-176 seat-fit guard): the
   * `UpdateGroup` capacity-increase check reads these to re-verify each booked
   * room still seats the new ceiling. Same center, tombstones excluded.
   */
  listActiveByGroupId(centerCode: CenterCode, groupId: GroupId): Promise<readonly WeeklyRecurringSession[]>;
  /**
   * Active sessions booked into one room (SOU-176 seat-fit guard): the
   * `UpdateRoom` capacity-decrease check reads these to re-verify every bound
   * group still fits the new capacity. Same center, tombstones excluded.
   */
  listActiveByRoomId(centerCode: CenterCode, roomId: RoomId): Promise<readonly WeeklyRecurringSession[]>;
  /**
   * Every active (non-tombstoned) recurring template of one center, ordered by
   * weekday then start time. The global read {@link ResetPlanning} (SOU-295) uses
   * to enumerate the templates to tombstone; unlike {@link listRefsForDay} it
   * spans all weekdays and returns full entities, not conflict refs. Same center,
   * tombstones excluded.
   */
  listActive(centerCode: CenterCode): Promise<readonly WeeklyRecurringSession[]>;
}
