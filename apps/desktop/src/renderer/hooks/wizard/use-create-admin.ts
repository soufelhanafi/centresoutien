import { useMutation } from '@tanstack/react-query';
import type { AdminCredentials } from '@centresoutien/domain';

/**
 * Creates the center's admin account over the typed IPC bridge (the wizard's one
 * live dependency, SOU-26). It deliberately does NOT touch the `admin.exists`
 * query cache: the first-run gate stays on the wizard until every step is done,
 * even though the account exists after this step.
 */
export function useCreateAdmin() {
  return useMutation({
    mutationFn: (input: AdminCredentials) => window.api.invoke('admin.create', input),
  });
}
