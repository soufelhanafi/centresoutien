import { useQuery } from '@tanstack/react-query';
import { attendanceGateway } from '../../lib/attendance/attendance-gateway';
import { attendanceKeys } from './keys';

/**
 * SOU-108: per-student session-by-session attendance history + absence summary
 * for a calendar month. Optionally filtered to a single group.
 */
export function useStudentAttendanceReport(studentId: string, month: string, groupId?: string) {
  return useQuery({
    queryKey: attendanceKeys.studentReport(studentId, month),
    queryFn: () => attendanceGateway.getStudentReport(studentId, month, groupId),
    refetchOnWindowFocus: false,
  });
}
