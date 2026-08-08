import { useMutation } from '@tanstack/react-query';
import { demoGateway } from '../../lib/demo/demo-gateway';

/**
 * Seeds the demo center and relaunches into it (SOU-110). The response is
 * `{ relaunching: true }` — the app restarts, so callers render the restarting
 * state on success and issue no further calls.
 */
export function useCreateDemo() {
  return useMutation({ mutationFn: () => demoGateway.create() });
}
