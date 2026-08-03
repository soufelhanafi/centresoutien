import { redirect } from '@tanstack/react-router';
import { usePlanStore } from '../stores/plan-store';
import { DEFAULT_ROUTE } from './nav-items';
import type { NavModule } from './nav-items';

/**
 * `beforeLoad` for a gated route: redirects to `DEFAULT_ROUTE` when the active
 * plan lacks `module.feature`. Content-gating (sidebar + `ModulePlaceholder`
 * lock overlay) already prevents navigation from the UI; this guards direct
 * hash-URL access to the same route.
 */
export function featureGateBeforeLoad(module: NavModule) {
  return () => {
    const { feature } = module;
    if (feature && !usePlanStore.getState().plan.features.has(feature)) {
      throw redirect({ to: DEFAULT_ROUTE });
    }
  };
}
