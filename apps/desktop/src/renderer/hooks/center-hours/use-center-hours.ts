import { useQuery } from '@tanstack/react-query';

/**
 * Reads the center's persisted weekly opening hours over the typed IPC bridge.
 * Returns only saved rows (empty on a fresh center — the form seeds the default
 * week from the domain). All data access goes through `window.api`.
 */
export function useCenterHours() {
  return useQuery({
    queryKey: ['center-hours'],
    queryFn: () => window.api.invoke('centerHours.get', {}),
  });
}
