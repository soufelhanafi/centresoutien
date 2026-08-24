import { useQuery } from '@tanstack/react-query';

export const sessionQueryKey = ['auth', 'session'] as const;

/**
 * Startup session check (SOU-27): is this device remembered AND does a trusted
 * principal still resolve (SOU-307)? Answered once per launch and treated as
 * stable — a successful login seeds the cache to `true` and a logout to `false`,
 * so the gate flips without another round-trip. Reopening the app re-runs this
 * query against the persisted device session.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => window.api.invoke('auth.session', {}),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
