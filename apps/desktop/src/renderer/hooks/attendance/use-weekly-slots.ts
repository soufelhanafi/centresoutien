import { useQuery } from '@tanstack/react-query';
import { attendanceGateway } from '../../lib/attendance/attendance-gateway';
import { attendanceKeys } from './keys';

/** Loads a group's weekly slots — the roll-call sheet resolves the one matching
 *  the picked date's weekday. Only fetches while the sheet is `open`. */
export function useWeeklySlots(groupId: string, open: boolean) {
  return useQuery({
    queryKey: attendanceKeys.weeklySlots(groupId),
    queryFn: () => attendanceGateway.weeklySlotsForGroup(groupId),
    enabled: open,
    refetchOnWindowFocus: false,
  });
}
