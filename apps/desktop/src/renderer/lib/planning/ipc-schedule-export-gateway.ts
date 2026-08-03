import type { ScheduleExportGateway, ScheduleExportRequest } from './schedule-export';

/** The real {@link ScheduleExportGateway}: maps each method onto its typed IPC channel (SOU-107). */
class IpcScheduleExportGateway implements ScheduleExportGateway {
  async print(request: ScheduleExportRequest): Promise<{ ok: true }> {
    return window.api.invoke('schedule.print', request);
  }

  async export(request: ScheduleExportRequest): Promise<{ savedPath: string | null }> {
    return window.api.invoke('schedule.export', request);
  }
}

export const ipcScheduleExportGateway: ScheduleExportGateway = new IpcScheduleExportGateway();
