import { useQuery } from '@tanstack/react-query';
import { licenseApi } from '../../lib/license/license-api';

export const licenseStatusQueryKey = ['license', 'status'] as const;

/**
 * Reads the current license state (SOU-104) for the first-run activation gate
 * and the Settings tab. Stable for the session; the activation mutation
 * invalidates it so a fresh activation flips the state without a manual refetch.
 */
export function useLicenseStatus() {
  return useQuery({
    queryKey: licenseStatusQueryKey,
    queryFn: () => licenseApi.status(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
