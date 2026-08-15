import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherAvailabilityKeys } from './use-teacher-availability';

/**
 * Soft-deletes one one-off teacher absence over the typed IPC bridge. The
 * boundary is idempotent (an already-archived absence still reports ok), so the
 * mutation only needs the id; invalidation targets the whole availability cache
 * — the server resolves the owning teacher by id, and the renderer must never
 * trust a caller-supplied teacher for correctness.
 */
export function useArchiveTeacherAvailabilityException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => window.api.invoke('teacherAvailabilityException.archive', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherAvailabilityKeys.all }),
  });
}
