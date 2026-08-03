import { useQuery } from '@tanstack/react-query';
import { arrearsGateway } from '../../lib/arrears/arrears-gateway';
import type { ArrearsFilters } from '../../lib/arrears/arrears-view';
import { arrearsKeys } from './keys';

/**
 * Loads the arrears follow-up list, filtered by month / amount range / group /
 * derived payment status. Data access goes through the {@link arrearsGateway}
 * seam, not `window.api` directly, so the mock adapter swaps for the real IPC
 * one in a single place.
 */
export function useArrears(filters: ArrearsFilters) {
  return useQuery({
    queryKey: arrearsKeys.list(filters),
    queryFn: () => arrearsGateway.list(filters),
    refetchOnWindowFocus: false,
  });
}
