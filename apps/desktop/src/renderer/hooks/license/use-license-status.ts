import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '../../lib/license/license-api';

export const licenseStatusQueryKey = ['license', 'status'] as const;

function refetchTrialAtExpiry(status: Awaited<ReturnType<typeof licenseApi.status>> | undefined): number | false {
  if (status?.status !== 'trial-active' || status.trial === null) return false;
  return Math.max(1, Date.parse(status.trial.expiresAt) - Date.now());
}

/**
 * Reads the current license state (SOU-104) for the first-run activation gate
 * and the Settings tab. A trial refreshes at main's supplied expiry instant so
 * the hard gate observes the server-side `trial-expired` transition without a
 * reload. Activation still invalidates the query immediately.
 */
export function useLicenseStatus() {
  return useQuery({
    queryKey: licenseStatusQueryKey,
    queryFn: () => licenseApi.status(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => refetchTrialAtExpiry(query.state.data),
    refetchIntervalInBackground: true,
  });
}
