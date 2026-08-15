import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherAvailabilityKeys } from './use-teacher-availability';

/**
 * Soft-deletes one one-off teacher absence over the typed IPC bridge. The
 * boundary is idempotent (an already-archived absence still reports ok), so the
 * mutation only needs the id; the caller passes the teacher too so the right
 * availability cache entry is invalidated.
 */
export function useArchiveTeacherAvailabilityException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; teacherId: string }) =>
      window.api.invoke('teacherAvailabilityException.archive', { id }),
    onSuccess: (_, { teacherId }) =>
      queryClient.invalidateQueries({ queryKey: teacherAvailabilityKeys.detail(teacherId) }),
  });
}
