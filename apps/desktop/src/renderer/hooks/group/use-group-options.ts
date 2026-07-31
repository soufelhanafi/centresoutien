import { useQuery } from '@tanstack/react-query';
import { groupsGateway } from '../../lib/groups/groups-gateway';
import { groupKeys } from './keys';

/** Loads the subject / room / teacher option lists for the create/edit form. */
export function useGroupOptions() {
  return useQuery({
    queryKey: groupKeys.options(),
    queryFn: () => groupsGateway.formOptions(),
    refetchOnWindowFocus: false,
  });
}
