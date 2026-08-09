import { useQueryClient } from '@tanstack/react-query';
import { usePlanStore } from '../../stores/plan-store';
import { demoStatusQueryKey } from './use-demo-status';
import type { DemoMutationResponse } from '../../lib/demo/demo-contract';

/**
 * Applies a completed demo hot-swap in the renderer (SOU-186). The main process
 * has already closed the previous center DB and opened the target one in place —
 * no process restart, no BrowserWindow reload — so every cached query now belongs
 * to the old DB and the active plan changed with it. Re-hydrate the plan gate,
 * publish the new demo status, then drop and refetch every screen's data.
 *
 * Device-scoped preferences (theme, dashboard view) are not center data and are
 * deliberately preserved across the swap.
 */
export function useDemoSwap(): (response: DemoMutationResponse) => Promise<void> {
  const queryClient = useQueryClient();
  const setPlan = usePlanStore((state) => state.setPlan);

  return async ({ isDemo }) => {
    queryClient.setQueryData(demoStatusQueryKey, { isDemo });
    const plan = await window.api?.invoke('plan.get', {})?.catch(() => undefined);
    if (plan) setPlan(plan.planId);
    await queryClient.invalidateQueries();
  };
}
