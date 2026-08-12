import { useQuery } from '@tanstack/react-query';
import { scheduleAuditGateway } from '../../lib/schedule-audit/schedule-audit-gateway';
import { scheduleAuditKeys } from './keys';

/**
 * Loads the sessions the center's effective (override-aware) hours or a holiday
 * now place outside every valid window (SOU-201). Data access goes through the
 * {@link scheduleAuditGateway} seam, not `window.api` directly, so the mock
 * adapter swaps for the real IPC one in a single place.
 */
export function useStrandedSessions() {
  return useQuery({
    queryKey: scheduleAuditKeys.outsideHours(),
    queryFn: () => scheduleAuditGateway.listOutsideHours(),
    refetchOnWindowFocus: false,
  });
}
