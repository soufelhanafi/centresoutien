import { useMutation, useQueryClient } from '@tanstack/react-query';
import { centerHoursOverridesGateway } from '../../lib/center-hours-overrides/overrides-gateway';
import { centerHoursOverrideKeys } from './keys';

/**
 * Soft-deletes (archives) a dated override. On success it invalidates every
 * override query so the Settings list and the planner's active-override lookup
 * both refetch — an archived override stops graying out the calendar. The gateway
 * maps this to the `centerHoursOverride.archive` channel.
 */
export function useArchiveCenterHoursOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => centerHoursOverridesGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: centerHoursOverrideKeys.all }),
  });
}
