import type { DashboardGateway } from './dashboard-gateway';
import type { DashboardAdvancedSummaryView, DashboardBasicSummaryView } from './dashboard-view';

/** The real {@link DashboardGateway}: one-line delegations to the two read channels (SOU-100). */
class IpcDashboardGateway implements DashboardGateway {
  async basicSummary(): Promise<DashboardBasicSummaryView> {
    const { summary } = await window.api.invoke('dashboard.basic', {});
    return summary;
  }

  async advancedSummary(): Promise<DashboardAdvancedSummaryView> {
    const { summary } = await window.api.invoke('dashboard.advanced', {});
    return summary;
  }
}

export const ipcDashboardGateway: DashboardGateway = new IpcDashboardGateway();
