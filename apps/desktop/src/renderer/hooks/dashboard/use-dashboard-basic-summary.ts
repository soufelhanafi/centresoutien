import { useQuery } from '@tanstack/react-query';
import { dashboardGateway } from '../../lib/dashboard/dashboard-gateway';
import { dashboardKeys } from './keys';

/** Loads the Basique dashboard's four cards — Argent, Effectifs, Charge, Séances (every plan). */
export function useDashboardBasicSummary(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.basic,
    queryFn: () => dashboardGateway.basicSummary(),
    enabled,
    refetchOnWindowFocus: false,
  });
}
