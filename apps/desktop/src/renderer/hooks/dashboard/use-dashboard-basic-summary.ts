import { useQuery } from '@tanstack/react-query';
import { dashboardGateway } from '../../lib/dashboard/dashboard-gateway';
import { dashboardKeys } from './keys';

/** Loads the Basique dashboard's three KPI cards (every plan). */
export function useDashboardBasicSummary() {
  return useQuery({
    queryKey: dashboardKeys.basic,
    queryFn: () => dashboardGateway.basicSummary(),
    refetchOnWindowFocus: false,
  });
}
