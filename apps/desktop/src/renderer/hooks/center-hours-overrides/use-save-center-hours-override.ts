import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CenterHoursOverrideInput } from '../../lib/center-hours-overrides/override-view';
import { centerHoursOverridesGateway } from '../../lib/center-hours-overrides/overrides-gateway';
import { centerHoursOverrideKeys } from './keys';

/**
 * Saves a dated override. On success it invalidates every override query so the
 * Settings list and the planner's active-override lookup both refetch — the
 * gray-out reflects the new hours immediately. The gateway maps this to the
 * `centerHoursOverride.save` channel; the envelope is injected in main.
 */
export function useSaveCenterHoursOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CenterHoursOverrideInput) => centerHoursOverridesGateway.save(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: centerHoursOverrideKeys.all }),
  });
}
