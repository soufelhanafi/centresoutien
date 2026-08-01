import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionWriteGateway } from '../../lib/planning/session-write-gateway';
import { plannerKeys } from './keys';

/**
 * Cancels (soft-deletes) a weekly recurring session — sets `deletedAt`, never a
 * hard delete (CLAUDE.md §5), so the tombstone still syncs. On success it
 * invalidates the planner week query so the block leaves the grid without a
 * reload. Throws `WeeklyRecurringSessionNotFoundError` for an unknown/already-
 * cancelled id (it does not silently succeed). Maps to `weeklySession.delete`.
 */
export function useCancelSession(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sessionWriteGateway.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: plannerKeys.all }),
  });
}
