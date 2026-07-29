import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WeeklyHoursInput } from '@centresoutien/domain';

/**
 * Saves the whole seven-row week over the typed IPC bridge. The main process
 * injects the envelope (centerCode, device, user); the renderer only sends the
 * user-editable times. On success it primes the cache with the echoed rows so
 * the form reflects exactly what was persisted.
 */
export function useSaveCenterHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (week: WeeklyHoursInput) => window.api.invoke('centerHours.save', week),
    onSuccess: (data) => queryClient.setQueryData(['center-hours'], data),
  });
}
