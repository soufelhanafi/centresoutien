import type { PlannerSessionView } from './planner-view';
import { ipcPlannerGateway } from './ipc-planner-gateway';

/**
 * The seam the planner UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-118)
 * SOU-118 enriched the `session.week` read model with the group/subject/room/
 * teacher join, so its `WeeklySessionDto` now carries the subject (id + bilingual
 * name), `level`, `kind`, and the room/teacher names the grid needs. The planner
 * therefore ships against the real {@link ipcPlannerGateway}; the interim mock is
 * gone.
 */
export interface PlannerGateway {
  /** All live sessions of the current center's week, any weekday, any kind. */
  listWeek(): Promise<readonly PlannerSessionView[]>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const plannerGateway: PlannerGateway = ipcPlannerGateway;
