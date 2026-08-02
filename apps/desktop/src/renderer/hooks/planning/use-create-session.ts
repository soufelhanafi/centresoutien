import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionInput } from '../../lib/planning/session-form-schema';
import { sessionWriteGateway } from '../../lib/planning/session-write-gateway';
import { plannerKeys } from './keys';

/**
 * Creates a weekly recurring session. On success it invalidates the planner week
 * query so the enriched grid row appears without a reload (same pattern as
 * `holiday.create`). Throws the scheduling errors on a clash — the caller maps
 * them inline via `mapSessionWriteError`. Maps to `weeklySession.create`.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) => sessionWriteGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
