import { useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/**
 * Removes a student from a group (frees the seat). Maps to `enrollment.unenroll`
 * under the real adapter. Invalidates every groups query so roster + fill % refetch.
 */
export function useRemoveStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => groupsGateway.removeStudent(enrollmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
