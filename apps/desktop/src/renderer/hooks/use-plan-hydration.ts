import { useEffect } from 'react';
import { usePlanStore } from '../stores/plan-store';

/**
 * Hydrate the UI's active plan from the main process once at startup. UI gating
 * is cosmetic — the domain PlanPolicy is the real enforcement (CLAUDE.md §4) —
 * so a failed load silently leaves the store on its default plan.
 */
export function usePlanHydration(): void {
  const setPlan = usePlanStore((state) => state.setPlan);

  useEffect(() => {
    window.api
      ?.invoke('plan.get', {})
      .then((res) => setPlan(res.planId))
      .catch(() => undefined);
  }, [setPlan]);
}
