import type { WeeklySessionView } from '../read-models/weekly-session-view';
import type { CenterCode } from '../value-objects/ids';

/**
 * Read port for the planner grid's enriched week (SOU-118). Separate from
 * {@link WeeklyRecurringSessionRepository} on purpose: that port persists the
 * session aggregate, whereas this one serves a **denormalized cross-aggregate
 * read** (session ⋈ group ⋈ subject, + room, + teacher). Keeping it apart lets the
 * `ListWeekSessions` use case depend on the read model alone — its unit test fakes a
 * flat list of {@link WeeklySessionView}s, while the join's correctness (including
 * the neutral fallback for a null/archived group) is proven against real SQLite in
 * the adapter's integration test.
 *
 * The SQLite adapter that owns `weekly_recurring_sessions` implements this port too
 * (one class, several ports — the same pattern as its `RoomReferencePort`), because
 * the join is anchored on that table.
 */
export interface WeeklySessionViewReadPort {
  /**
   * Every active (non-tombstoned) session of the center as an enriched view,
   * ordered by weekday then start time — the full week the planner grid renders.
   * Sessions whose group/room/teacher is missing or archived are still returned,
   * with the affected fields degraded to their neutral fallback (see
   * {@link WeeklySessionView}).
   */
  listWeekView(centerCode: CenterCode): Promise<readonly WeeklySessionView[]>;
}
