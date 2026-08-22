import type { DayCloseGateway } from './day-close-gateway';
import type { DayCloseReport } from './day-close-report';

/**
 * The real {@link DayCloseGateway}: maps `getReport` onto `dayCloseReport.get`,
 * `print` onto `dayCloseReport.print`, and `export` onto `dayCloseReport.export`.
 * centerCode is injected in main, never sent from the renderer; the report is FR-only.
 */
class IpcDayCloseGateway implements DayCloseGateway {
  async getReport(day: string): Promise<DayCloseReport> {
    return window.api.invoke('dayCloseReport.get', { day });
  }

  async print(day: string): Promise<void> {
    await window.api.invoke('dayCloseReport.print', { day });
  }

  async export(day: string): Promise<{ savedPath: string | null }> {
    return window.api.invoke('dayCloseReport.export', { day });
  }
}

export const ipcDayCloseGateway: DayCloseGateway = new IpcDayCloseGateway();
