import { useMutation } from '@tanstack/react-query';
import { centerGateway } from '../../lib/center/center-gateway-instance';
import { useResetCenterContext } from './use-reset-center-context';

/**
 * Switches the open center from the header (SOU-96). On success the shared
 * tenant-context reset drops every client cache, re-reads the per-center plan, and
 * lands on the new center's dashboard. The DB swap itself happens in main behind
 * `center.switch`; the renderer only owns the reset.
 */
export function useSwitchCenter() {
  const resetCenterContext = useResetCenterContext();

  return useMutation({
    mutationFn: (centreId: string) => centerGateway.switchTo(centreId),
    onSuccess: resetCenterContext,
  });
}
