import { useQuery } from '@tanstack/react-query';

/** Query-key factory: one cache entry per teacher's availability picture. */
export const teacherAvailabilityKeys = {
  all: ['teacher-availability'] as const,
  detail: (teacherId: string) => ['teacher-availability', teacherId] as const,
};

/**
 * Reads one teacher's full availability picture (SOU-259) over the typed IPC
 * bridge: the weekly windows (`availability: null` = nothing configured, the
 * teacher is unrestricted) plus every live one-off absence, in one round trip.
 */
export function useTeacherAvailability(teacherId: string) {
  return useQuery({
    queryKey: teacherAvailabilityKeys.detail(teacherId),
    queryFn: () => window.api.invoke('teacherAvailability.get', { teacherId }),
  });
}
