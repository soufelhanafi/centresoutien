import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { CenterCode } from '../value-objects/ids';

/**
 * Read port for enriched concrete dated-session occurrences (SOU-201). Separate
 * from {@link SessionRepository} on purpose — that port persists the session
 * aggregate, whereas this serves a **denormalized cross-aggregate read** (session
 * ⋈ group ⋈ subject, + room, + teacher) — exactly the split
 * {@link WeeklySessionViewReadPort} makes for the planner grid. Keeping it apart
 * lets `AuditSessionsOutsideEffectiveHours` depend on the read model alone: its
 * unit test fakes a flat list of {@link SessionOccurrenceView}s, while the join's
 * correctness (including the neutral fallback for a null/archived relation and the
 * tombstone exclusion) is proven against real SQLite in the adapter's integration
 * test.
 *
 * The SQLite adapter that owns `sessions` implements this port too (one class,
 * several ports — the same pattern its sibling uses for
 * {@link WeeklySessionViewReadPort}), because the join is anchored on that table.
 */
export interface SessionOccurrenceViewReadPort {
  /**
   * Every live (non-tombstoned) occurrence of the center as an enriched view,
   * ordered by `date` then `start` — the full set the audit sweeps. A cancelled
   * (soft-deleted) occurrence is excluded here, so the audit never reports a row
   * the operator already cancelled. Occurrences whose group/room/teacher is
   * missing or archived are still returned, with the affected fields degraded to
   * their neutral fallback (see {@link SessionOccurrenceView}). Scoped to one
   * center; never crosses a tenant boundary.
   */
  listActiveOccurrenceViews(centerCode: CenterCode): Promise<readonly SessionOccurrenceView[]>;
}
