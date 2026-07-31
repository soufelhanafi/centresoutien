import { useQuery } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Loads a group's roster (enrolled students). Mocked until SOU-127. */
export function useGroupRoster(groupId: string) {
  return useQuery({
    queryKey: groupKeys.roster(groupId),
    queryFn: () => groupsGateway.roster(groupId),
    refetchOnWindowFocus: false,
  });
}
