import { useMutation } from '@tanstack/react-query';
import { demoGateway } from '../../lib/demo/demo-gateway';
import { useDemoSwap } from './use-demo-swap';

/**
 * Swaps back to the real center and deletes the demo artefacts (SOU-110 /
 * SOU-186). Resolves `{ isDemo: false }` after the in-process DB swap;
 * `onSuccess` re-hydrates the plan and refetches every screen — no restart, no
 * reload. A failed swap rejects and leaves the demo center open, so callers
 * surface an error and keep state.
 */
export function useWipeDemo() {
  const applyDemoSwap = useDemoSwap();
  return useMutation({
    mutationFn: () => demoGateway.wipe(),
    onSuccess: applyDemoSwap,
  });
}
