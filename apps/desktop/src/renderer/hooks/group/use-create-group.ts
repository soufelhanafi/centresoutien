import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GroupInput } from '@centresoutien/domain';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Creates a group. On success it invalidates every groups query so the list refetches. */
export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) => groupsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}
