import { useMutation } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';

/**
 * Designates this device as its center's hub (SOU-318). Enabling is a config write
 * that main follows with an app restart, so the resolved status is shown only
 * briefly before relaunch; the hosting card reads the durable state again on boot.
 */
export function useEnableHosting() {
  return useMutation({
    mutationFn: () => hubGateway.enableHosting(),
  });
}
