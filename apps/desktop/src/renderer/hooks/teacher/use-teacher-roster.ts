import { useQuery } from '@tanstack/react-query';
import { teacherRosterGateway } from '../../lib/teachers/teacher-roster-gateway';
import { teacherKeys } from './keys';

/** Loads a teacher's full student roster (SOU-299) — active and left rows; the
 *  tab filters client-side. */
export function useTeacherRoster(teacherId: string) {
  return useQuery({
    queryKey: teacherKeys.roster(teacherId),
    queryFn: () => teacherRosterGateway.roster(teacherId),
    refetchOnWindowFocus: false,
  });
}
