import { useQuery } from '@tanstack/react-query';

export const adminExistsQueryKey = ['admin', 'exists'] as const;

/**
 * First-run detection (SOU-25): the wizard shows only when no admin account is
 * persisted yet. The result is treated as stable for the session — creating the
 * admin mid-wizard must not flip the gate to the app while later steps remain, so
 * the gate seeds `exists: true` itself once the whole wizard completes.
 */
export function useAdminExists() {
  return useQuery({
    queryKey: adminExistsQueryKey,
    queryFn: () => window.api.invoke('admin.exists', {}),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
