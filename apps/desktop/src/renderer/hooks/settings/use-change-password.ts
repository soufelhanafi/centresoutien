import { useMutation } from '@tanstack/react-query';
import type { ChangeAdminPasswordCredentials } from '@centresoutien/domain';

/**
 * Changes the sole admin account's password over the typed IPC bridge
 * (SOU-31). Single-admin app: no username in the request. Rejects with
 * `InvalidCurrentPasswordError` on a wrong current password — the caller maps
 * that via `mapChangePasswordError`.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangeAdminPasswordCredentials) => window.api.invoke('admin.changePassword', input),
  });
}
