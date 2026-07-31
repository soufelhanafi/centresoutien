import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/** Archives (soft-deletes) a teacher. Invalidates every teachers query. */
export function useArchiveTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teachersGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.all }),
  });
}
