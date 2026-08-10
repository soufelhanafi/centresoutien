import { useQuery } from '@tanstack/react-query';
import { centerGateway } from '../../lib/center/center-gateway-instance';

export const currentCenterQueryKey = ['centers', 'current'] as const;

/**
 * Resolves the currently-open center for the switcher's trigger label (SOU-96).
 * Disabled for non-Premium users via `enabled` — the header falls back to the
 * plain center-name label. Data access goes through the swappable `CenterGateway`.
 */
export function useCurrentCenter(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: currentCenterQueryKey,
    queryFn: () => centerGateway.current(),
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: false,
  });
}
