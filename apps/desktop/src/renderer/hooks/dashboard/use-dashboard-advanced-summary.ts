import { useQuery } from '@tanstack/react-query';
import { dashboardGateway } from '../../lib/dashboard/dashboard-gateway';
import { dashboardKeys } from './keys';

/**
 * Loads the Avancé dashboard's four widgets. `enabled` gates the call on
 * `dashboard.advanced` — callers pass `useFeature('dashboard.advanced')` so a
 * locked plan never issues the request (the domain would reject it anyway).
 */
export function useDashboardAdvancedSummary(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.advanced,
    queryFn: () => dashboardGateway.advancedSummary(),
    enabled,
    refetchOnWindowFocus: false,
  });
}
