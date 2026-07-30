import { useQuery } from '@tanstack/react-query';

export const centerProfileQueryKey = ['center', 'profile'] as const;

/**
 * Loads the single center row over the typed IPC bridge (SOU-28). Returns
 * `{ center: null }` before the first save — the Settings form then starts
 * blank and the first submit creates the row. All data access goes through
 * `window.api`; the renderer never touches the database directly.
 */
export function useCenterProfile() {
  return useQuery({
    queryKey: centerProfileQueryKey,
    queryFn: () => window.api.invoke('center.get', {}),
    refetchOnWindowFocus: false,
  });
}
