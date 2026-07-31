import { useQuery } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Loads a single enriched group by id. Returns `null` when not found. */
export function useGroup(id: string) {
  return useQuery({
    queryKey: groupKeys.detail(id),
    queryFn: () => groupsGateway.get(id),
    refetchOnWindowFocus: false,
  });
}
