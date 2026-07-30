import { useQuery } from '@tanstack/react-query';
import { plannerGateway } from '../../lib/planning/planner-gateway';
import { plannerKeys } from './keys';

/**
 * Loads the current center's weekly sessions for the planner grid. Data access
 * goes through the {@link plannerGateway} seam, not `window.api` directly, so the
 * mock adapter swaps for the real IPC one in a single place.
 */
export function useWeekSessions() {
  return useQuery({
    queryKey: plannerKeys.week(),
    queryFn: () => plannerGateway.listWeek(),
    refetchOnWindowFocus: false,
  });
}
