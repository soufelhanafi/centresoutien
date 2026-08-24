import { useQuery } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';
import { hubKeys } from './keys';

/**
 * Reads whether this device currently hosts its center's hub (SOU-318). `enabled`
 * lets the hosting card skip the round trip while the card is plan-hidden, so a
 * plan without `sync.multi-device` never fires an IPC the domain gate rejects.
 */
export function useHostingStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: hubKeys.hostingStatus,
    queryFn: () => hubGateway.hostingStatus(),
    enabled: options?.enabled ?? true,
    refetchOnWindowFocus: false,
  });
}
