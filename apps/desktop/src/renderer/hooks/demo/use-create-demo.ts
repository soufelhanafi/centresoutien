import { useMutation } from '@tanstack/react-query';
import { demoGateway } from '../../lib/demo/demo-gateway';
import { useDemoSwap } from './use-demo-swap';

/**
 * Seeds the demo center and hot-swaps into it (SOU-110 / SOU-186). Resolves
 * `{ isDemo: true }` after the in-process DB swap; `onSuccess` re-hydrates the
 * plan and refetches every screen — no restart, no reload. A failed swap rejects
 * and leaves the real center open, so callers surface an error and keep state.
 */
export function useCreateDemo() {
  const applyDemoSwap = useDemoSwap();
  return useMutation({
    mutationFn: () => demoGateway.create(),
    onSuccess: applyDemoSwap,
  });
}
