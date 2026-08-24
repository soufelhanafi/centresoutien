import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DEFAULT_ROUTE } from '../../app/nav-items';
import { loadActivePlan } from '../use-plan-hydration';
import { usePlanStore } from '../../stores/plan-store';
import { useDashboardViewStore } from '../../stores/dashboard-view-store';
import { useCommandPaletteStore } from '../../stores/command-palette-store';

/**
 * The renderer-side tenant reset run after the open center changes — whether the
 * operator switched centers (SOU-96) or added one and landed in it (SOU-310). It
 * drops every client cache so no data bleeds between tenants: `queryClient.clear()`
 * wipes all TanStack caches, the device-scoped UI stores reset, the per-center plan
 * is re-read, and the app lands on the new center's dashboard. The DB swap itself
 * happens in main; this only owns the reset.
 */
export function useResetCenterContext(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setPlan = usePlanStore((state) => state.setPlan);
  const resetDashboardView = useDashboardViewStore((state) => state.reset);
  const setCommandPaletteOpen = useCommandPaletteStore((state) => state.setOpen);

  return async () => {
    queryClient.clear();
    resetDashboardView();
    setCommandPaletteOpen(false);
    await loadActivePlan(setPlan);
    await navigate({ to: DEFAULT_ROUTE });
  };
}
