import type { ScheduleExportGateway } from './schedule-export';

/** In-memory stand-in for the not-yet-merged `schedule.print` / `schedule.export`
 *  channels (SOU-107, see `schedule-export.ts`'s contract-status note). */
class MockScheduleExportGateway implements ScheduleExportGateway {
  async print(): Promise<{ ok: true }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { ok: true };
  }

  async export(): Promise<{ savedPath: string | null }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { savedPath: '/tmp/planning.pdf' };
  }
}

export const mockScheduleExportGateway: ScheduleExportGateway = new MockScheduleExportGateway();
