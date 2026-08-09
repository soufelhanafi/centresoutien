import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DEFAULT_ROUTE } from '../../app/nav-items';
import { centerGateway } from '../../lib/center/center-gateway-instance';
import { loadActivePlan } from '../use-plan-hydration';
import { usePlanStore } from '../../stores/plan-store';
import { useDashboardViewStore } from '../../stores/dashboard-view-store';
import { useCommandPaletteStore } from '../../stores/command-palette-store';

/**
 * Switches the open center from the header (SOU-96). On success every client
 * cache is dropped so no data bleeds between tenants: `queryClient.clear()` wipes
 * all TanStack caches, the device-scoped UI stores reset, the per-center plan is
 * re-read, and the app lands on the new center's dashboard. The DB swap itself
 * happens in main behind `center.switch`; the renderer only owns the reset.
 */
export function useSwitchCenter() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setPlan = usePlanStore((state) => state.setPlan);
  const resetDashboardView = useDashboardViewStore((state) => state.reset);
  const setCommandPaletteOpen = useCommandPaletteStore((state) => state.setOpen);

  return useMutation({
    mutationFn: (centreId: string) => centerGateway.switchTo(centreId),
    onSuccess: async () => {
      queryClient.clear();
      resetDashboardView();
      setCommandPaletteOpen(false);
      await loadActivePlan(setPlan);
      await navigate({ to: DEFAULT_ROUTE });
    },
  });
}
