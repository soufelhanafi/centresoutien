import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planningResetGateway } from '../../lib/planning/planning-reset-gateway';
import { plannerKeys } from './keys';

/**
 * Wipes all future sessions from a computed cutoff date (SOU-295). On success it
 * invalidates the planner week query so the emptied grid appears without a reload
 * (same pattern as `useCreateSession`). Maps to the `planning.reset` channel.
 */
export function useResetPlanning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cutoffDate: string) => planningResetGateway.reset(cutoffDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
