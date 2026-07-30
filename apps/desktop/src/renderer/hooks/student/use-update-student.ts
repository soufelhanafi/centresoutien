import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudentInput } from '@centresoutien/domain';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentKeys } from './keys';

/** Edits an existing student's fields. Invalidates the list and this detail. */
export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudentInput) => studentsGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentKeys.all }),
  });
}
