import { useQuery } from '@tanstack/react-query';
import { attendanceGateway } from '../../lib/attendance/attendance-gateway';
import { attendanceKeys } from './keys';

/**
 * SOU-108: per-student session-by-session attendance history + absence summary
 * for a calendar month. Fetches all groups; client-side group filtering via
 * the returned history rows.
 */
export function useStudentAttendanceReport(studentId: string, month: string) {
  return useQuery({
    queryKey: attendanceKeys.studentReport(studentId, month),
    queryFn: () => attendanceGateway.getStudentReport(studentId, month),
    refetchOnWindowFocus: false,
  });
}
