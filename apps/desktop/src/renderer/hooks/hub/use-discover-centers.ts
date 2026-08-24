import { useMutation } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';

/**
 * Browses the LAN for centers to join (SOU-318). Modeled as a mutation, not a
 * query: it is a ~2.5s side-effecting scan the user triggers explicitly (and can
 * re-run), never a cached read that refetches on its own.
 */
export function useDiscoverCenters() {
  return useMutation({
    mutationFn: () => hubGateway.discoverCenters(),
  });
}
