import { useQuery } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';
import { hubKeys } from './keys';

/**
 * Browses the LAN for centers to join (SOU-318). Modeled as a query so discovery
 * runs on mount without a `useEffect`-driven IPC call; a fresh browse each time
 * (not cached across mounts) and re-run explicitly via `refetch`. The ~2.5s scan
 * is not auto-refetched on focus, and a failure surfaces as `isError` rather than
 * retrying on its own.
 */
export function useDiscoverCenters() {
  return useQuery({
    queryKey: hubKeys.discover,
    queryFn: () => hubGateway.discoverCenters(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
