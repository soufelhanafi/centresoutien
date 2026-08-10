import { useQueryClient } from '@tanstack/react-query';
import { usePlanStore } from '../../stores/plan-store';
import { demoStatusQueryKey } from './use-demo-status';
import { demoGateway } from '../../lib/demo/demo-gateway';

/**
 * Applies a completed demo hot-swap in the renderer (SOU-186). The main process
 * has already closed the previous center DB and opened the target one in place —
 * no process restart, no BrowserWindow reload — so every cached query now belongs
 * to the old DB and the active plan changed with it. Re-hydrate the plan gate,
 * publish the new demo status, then drop and refetch every screen's data.
 *
 * The demo status is re-read from main and awaited before the swap completion is
 * visible to any screen (SOU-195): publishing a partial `{ isDemo }` first let
 * the login form mount with `demoLogin` still missing, and mount-time form
 * defaults never re-applied, so prefill was lost for good. Awaiting the full
 * read also restores `isHubHost` for the SOU-190 guard after a swap back.
 *
 * Device-scoped preferences (theme, dashboard view) are not center data and are
 * deliberately preserved across the swap.
 */
export function useDemoSwap(): () => Promise<void> {
  const queryClient = useQueryClient();
  const setPlan = usePlanStore((state) => state.setPlan);

  return async () => {
    const status = await demoGateway.status();
    queryClient.setQueryData(demoStatusQueryKey, status);
    const plan = await window.api?.invoke('plan.get', {})?.catch(() => undefined);
    if (plan) setPlan(plan.planId);
    await queryClient.invalidateQueries();
  };
}
