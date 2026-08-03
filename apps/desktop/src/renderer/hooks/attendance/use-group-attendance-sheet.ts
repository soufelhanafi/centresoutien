import { useQuery } from '@tanstack/react-query';
import { attendanceGateway } from '../../lib/attendance/attendance-gateway';
import { attendanceKeys } from './keys';

/**
 * SOU-108: printable per-group attendance sheet for a calendar month.
 * Sessions = columns, students = rows, cells = status | null.
 */
export function useGroupAttendanceSheet(groupId: string, month: string) {
  return useQuery({
    queryKey: attendanceKeys.groupSheet(groupId, month),
    queryFn: () => attendanceGateway.getGroupSheet(groupId, month),
    refetchOnWindowFocus: false,
  });
}
