import { useQuery } from '@tanstack/react-query';
import { multiCenterStatsGateway } from '../../lib/multi-center-stats/multi-center-stats-gateway';
import { multiCenterStatsKeys } from './keys';

/**
 * Loads the current-month per-center comparison (Premium `org.multi-center`).
 * `enabled` stays false on a locked plan so the gated screen never fires the
 * rejecting call.
 */
export function useMultiCenterStats(enabled: boolean) {
  return useQuery({
    queryKey: multiCenterStatsKeys.view,
    queryFn: () => multiCenterStatsGateway.get(),
    enabled,
    refetchOnWindowFocus: false,
  });
}
