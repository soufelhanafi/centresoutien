import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GroupInput } from '@centresoutien/domain';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Updates a group's metadata. Invalidates every groups query so list + detail refetch. */
export function useUpdateGroup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => groupsGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
