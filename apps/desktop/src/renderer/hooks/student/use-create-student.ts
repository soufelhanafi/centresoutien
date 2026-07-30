import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudentInput } from '@centresoutien/domain';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentKeys } from './keys';

/**
 * Creates a student. On success it invalidates every students query so the list
 * and counts refetch. The gateway maps this to `student.create` (the one
 * published channel) once the real adapter replaces the mock.
 */
export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StudentInput) => studentsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: studentKeys.all }),
  });
}
