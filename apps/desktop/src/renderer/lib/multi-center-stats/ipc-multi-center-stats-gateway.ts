import type { MultiCenterStatsGateway } from './multi-center-stats-gateway';
import type { MultiCenterStatsViewModel } from './multi-center-stats-view';

/** The real {@link MultiCenterStatsGateway}: thin delegations to the three channels (SOU-106). */
class IpcMultiCenterStatsGateway implements MultiCenterStatsGateway {
  async get(): Promise<MultiCenterStatsViewModel> {
    const { view } = await window.api.invoke('multiCenterStats.get', {});
    return view;
  }

  async print(locale: 'fr' | 'ar'): Promise<void> {
    await window.api.invoke('multiCenterStats.print', { locale });
  }

  async export(locale: 'fr' | 'ar'): Promise<string | null> {
    const { savedPath } = await window.api.invoke('multiCenterStats.export', { locale });
    return savedPath;
  }
}

export const ipcMultiCenterStatsGateway: MultiCenterStatsGateway = new IpcMultiCenterStatsGateway();
