import type { PlannerSessionView } from './planner-view';
import { mockPlannerGateway } from './mock-planner-gateway';

/**
 * The seam the planner UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-54 frontend ↔ SOU-53 data)
 * SOU-53 now publishes the `session.week` IPC channel, but its `WeeklySessionDto`
 * is the **bare entity** (`id`, `roomId`, `teacherId`, `dayOfWeek`, `start`,
 * `end`) — it has no subject, no room/teacher names, no level, and no kind, so it
 * cannot yet feed the grid's subject colouring, exam-prep badge, or
 * teacher/room/level filters. Until that read model is enriched with the join
 * (see {@link PlannerSessionView}), the planner runs end-to-end against
 * {@link mockPlannerGateway}. Swapping in the real IPC adapter is then this one
 * line, with no change to any component.
 */
export interface PlannerGateway {
  /** All live sessions of the current center's week, any weekday, any kind. */
  listWeek(): Promise<readonly PlannerSessionView[]>;
}

/** The active gateway. Mock today; swap for the IPC adapter when the channel lands. */
export const plannerGateway: PlannerGateway = mockPlannerGateway;
