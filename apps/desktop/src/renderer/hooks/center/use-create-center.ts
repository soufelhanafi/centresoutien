import { useMutation } from '@tanstack/react-query';
import type { CenterProfileInput } from '@centresoutien/domain';
import { centerGateway } from '../../lib/center/center-gateway-instance';
import { useResetCenterContext } from './use-reset-center-context';

/**
 * Creates an additional center and lands in it (SOU-310, Premium). The backend
 * provisions the new isolated DB and switches into it as one operation, so on
 * success this reuses the same tenant-context reset as a plain switch — every
 * client cache dropped, the per-center plan re-read, and the app on the new
 * center's dashboard. A rejected `center.create` (locked plan, failed provision)
 * surfaces as the mutation's error state.
 */
export function useCreateCenter() {
  const resetCenterContext = useResetCenterContext();

  return useMutation({
    mutationFn: (profile: CenterProfileInput) => centerGateway.createCenter(profile),
    onSuccess: resetCenterContext,
  });
}
