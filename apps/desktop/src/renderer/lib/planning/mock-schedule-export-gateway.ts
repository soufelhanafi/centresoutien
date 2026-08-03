import type { ScheduleExportGateway } from './schedule-export';

/** In-memory stand-in for the not-yet-published `schedule.printWeekPdf` /
 *  `schedule.exportWeekPdf` channels (SOU-107, see `schedule-export.ts`). */
class MockScheduleExportGateway implements ScheduleExportGateway {
  async print(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  async export(): Promise<{ savedPath: string | null }> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { savedPath: '/tmp/planning.pdf' };
  }
}

export const mockScheduleExportGateway: ScheduleExportGateway = new MockScheduleExportGateway();
