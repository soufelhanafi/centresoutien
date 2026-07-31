import { useQuery } from '@tanstack/react-query';
import type { GroupStatus } from '../../lib/groups/group-view';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/**
 * Loads the enriched group list for one lifecycle state — `active` (default list)
 * or `archived` (restore view). Subject/level/kind filtering is applied
 * client-side in the panel. Data access goes through the {@link groupsGateway}
 * seam, not `window.api` directly.
 */
export function useGroups(status: GroupStatus) {
  return useQuery({
    queryKey: groupKeys.list(status),
    queryFn: () => groupsGateway.list(status),
    refetchOnWindowFocus: false,
  });
}
