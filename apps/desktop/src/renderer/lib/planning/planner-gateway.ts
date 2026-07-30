import type { PlannerSessionView } from './planner-view';
import { mockPlannerGateway } from './mock-planner-gateway';

/**
 * The seam the planner UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-54 frontend ↔ SOU-53 data)
 * SOU-53 ships the `WeeklyRecurringSession` entity + repository port with a
 * `listForWeek(centerCode)` read, but **no IPC channel** exposes it to the
 * renderer yet (flagged there as a small follow-up). Until that `session.listWeek`
 * channel lands, the planner runs end-to-end against {@link mockPlannerGateway}.
 * Swapping in the real IPC adapter — which joins the entity with room / teacher /
 * subject to build {@link PlannerSessionView} — is this one line.
 */
export interface PlannerGateway {
  /** All live sessions of the current center's week, any weekday, any kind. */
  listWeek(): Promise<readonly PlannerSessionView[]>;
}

/** The active gateway. Mock today; swap for the IPC adapter when the channel lands. */
export const plannerGateway: PlannerGateway = mockPlannerGateway;
