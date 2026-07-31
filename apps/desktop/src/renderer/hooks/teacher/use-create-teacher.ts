import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeacherInput } from '@centresoutien/domain';
import { teachersGateway } from '../../lib/teachers/teachers-gateway';
import { teacherKeys } from './keys';

/**
 * Creates a teacher. On success it invalidates every teachers query so the list
 * and the seats nudge refetch. The gateway maps this to `teacher.create`, then
 * reads the full view back through `teacher.get`.
 */
export function useCreateTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeacherInput) => teachersGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teacherKeys.all }),
  });
}
