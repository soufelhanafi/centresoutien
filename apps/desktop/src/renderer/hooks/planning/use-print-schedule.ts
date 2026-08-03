import { useMutation } from '@tanstack/react-query';
import { scheduleExportGateway } from '../../lib/planning/schedule-export';
import type { ScheduleExportRequest } from '../../lib/planning/schedule-export';

/** Renders the weekly schedule PDF and opens it in the OS's default viewer. */
export function usePrintSchedule() {
  return useMutation({
    mutationFn: (request: ScheduleExportRequest) => scheduleExportGateway.print(request),
  });
}
