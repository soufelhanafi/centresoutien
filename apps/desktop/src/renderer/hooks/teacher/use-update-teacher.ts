import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeacherInput } from '@centresoutien/domain';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/** Edits an existing teacher's fields. Invalidates the list and this detail. */
export function useUpdateTeacher(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeacherInput) => teachersGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.all }),
  });
}
