import type { DashboardAdvancedSummaryView, DashboardBasicSummaryView } from './dashboard-view';
import { ipcDashboardGateway } from './ipc-dashboard-gateway';

/**
 * The seam the dashboard UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 */
export interface DashboardGateway {
  /** `dashboard.basic` — every plan. */
  basicSummary(): Promise<DashboardBasicSummaryView>;
  /** `dashboard.advanced` — Premium; rejects with `PlanFeatureUnavailableError` on a locked plan. */
  advancedSummary(): Promise<DashboardAdvancedSummaryView>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const dashboardGateway: DashboardGateway = ipcDashboardGateway;
