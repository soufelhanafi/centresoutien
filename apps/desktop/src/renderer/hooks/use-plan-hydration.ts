import { useEffect } from 'react';
import type { PlanId } from '@centresoutien/domain';
import { usePlanStore } from '../stores/plan-store';

/**
 * Read the active plan from the main process and mirror it into the UI store. UI
 * gating is cosmetic — the domain PlanPolicy is the real enforcement (CLAUDE.md
 * §4) — so a failed read leaves the store on its current plan. Reused at startup
 * and after a center switch, since the plan is per-center (a switch must re-read
 * it, never carry the previous center's entitlements over).
 */
export async function loadActivePlan(setPlan: (id: PlanId) => void): Promise<void> {
  try {
    const result = await window.api?.invoke('plan.get', {});
    if (result) {
      setPlan(result.planId);
    }
  } catch {
    // keep the current plan on a failed read
  }
}

/** Hydrate the UI's active plan from the main process once at startup. */
export function usePlanHydration(): void {
  const setPlan = usePlanStore((state) => state.setPlan);

  useEffect(() => {
    void loadActivePlan(setPlan);
  }, [setPlan]);
}
