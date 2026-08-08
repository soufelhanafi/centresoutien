import { useMutation } from '@tanstack/react-query';
import { demoGateway } from '../../lib/demo/demo-gateway';

/**
 * Deletes the demo center and relaunches into the real center (SOU-110). Same
 * `{ relaunching: true }` contract as `demo.create` — on success the app
 * restarts and callers stop issuing calls.
 */
export function useWipeDemo() {
  return useMutation({ mutationFn: () => demoGateway.wipe() });
}
