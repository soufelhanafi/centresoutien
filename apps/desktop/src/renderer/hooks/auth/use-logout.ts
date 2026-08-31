import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey } from './use-session';

/**
 * Forgets the remembered device (SOU-27) and flips the gate back to the login
 * screen without a round-trip by seeding the session cache to unauthenticated.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => window.api.invoke('auth.logout', {}),
    onSuccess: () =>
      queryClient.setQueryData(sessionQueryKey, {
        authenticated: false,
        role: null,
        permissions: null,
      }),
  });
}
