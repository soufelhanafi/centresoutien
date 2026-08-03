import { useMutation } from '@tanstack/react-query';
import { scheduleExportGateway } from '../../lib/planning/schedule-export';
import type { ScheduleExportRequest } from '../../lib/planning/schedule-export';

/** Renders the weekly schedule PDF and lets the user pick a save location. */
export function useExportSchedule() {
  return useMutation({
    mutationFn: (request: ScheduleExportRequest) => scheduleExportGateway.export(request),
  });
}
