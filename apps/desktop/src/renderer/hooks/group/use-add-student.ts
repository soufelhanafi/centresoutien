import { useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

type AddStudentInput = { groupId: string; studentId: string; startMonth: string };

/**
 * Enrolls a student in a group (quick add-student modal). Maps to
 * `enrollment.create` under the real adapter. Invalidates every groups query so
 * the roster, fill %, and enrollable list all refetch.
 */
export function useAddStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, studentId, startMonth }: AddStudentInput) =>
      groupsGateway.addStudent(groupId, studentId, startMonth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
