import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentKeys } from './keys';

/** Archives (soft-deletes) a student. Invalidates every students query. */
export function useArchiveStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studentsGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentKeys.all }),
  });
}
