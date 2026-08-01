import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionInput } from '../../lib/planning/session-form-schema';
import { sessionWriteGateway } from '../../lib/planning/session-write-gateway';
import { plannerKeys } from './keys';

/**
 * Edits a weekly recurring session. On success it invalidates the planner week
 * query so the grid repaints without a reload. Throws the scheduling errors on a
 * clash (mapped inline by the caller via `mapSessionWriteError`), and
 * `WeeklyRecurringSessionNotFoundError` for a stale id. Maps to `weeklySession.update`.
 */
export function useUpdateSession(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) => sessionWriteGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
