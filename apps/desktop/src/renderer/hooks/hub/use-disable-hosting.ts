import { useMutation } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';

/**
 * Stops hosting this center's hub (SOU-318). Like enabling, main follows the
 * config write with an app restart, so the card reads the durable state again on
 * boot rather than optimistically flipping.
 */
export function useDisableHosting() {
  return useMutation({
    mutationFn: () => hubGateway.disableHosting(),
  });
}
