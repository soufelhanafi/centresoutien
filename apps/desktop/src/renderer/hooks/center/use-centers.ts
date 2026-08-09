import { useQuery } from '@tanstack/react-query';
import { centerGateway } from '../../lib/center/center-gateway-instance';

export const centersQueryKey = ['centers', 'list'] as const;

/**
 * Lists the local centers this device holds for the switcher (SOU-96). Disabled
 * for non-Premium users via `enabled` so a single-center install never pays for
 * the read. Data access goes through the swappable `CenterGateway`, never the DB.
 */
export function useCenters(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: centersQueryKey,
    queryFn: () => centerGateway.list(),
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: false,
  });
}
