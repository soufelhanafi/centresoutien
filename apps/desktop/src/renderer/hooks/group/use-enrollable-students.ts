import { useQuery } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Loads the students not yet enrolled in a group — the add-student picker source. */
export function useEnrollableStudents(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: groupKeys.enrollable(groupId),
    queryFn: () => groupsGateway.enrollableStudents(groupId),
    enabled,
    refetchOnWindowFocus: false,
  });
}
