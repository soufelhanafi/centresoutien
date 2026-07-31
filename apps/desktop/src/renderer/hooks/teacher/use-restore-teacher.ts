import { useMutation, useQueryClient } from '@tanstack/react-query';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/** Restores an archived teacher back to the active list. Invalidates every teachers query. */
export function useRestoreTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teachersGateway.restore(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.all }),
  });
}
