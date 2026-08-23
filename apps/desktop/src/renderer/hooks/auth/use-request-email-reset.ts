import { useMutation } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';

type RequestEmailResetInput = IpcRequest<'auth.emailReset.request'>;

/**
 * Asks the relay to email a locale-aware 6-digit reset code to the owner's
 * stored address (SOU-273). Unauthenticated — the owner is locked out. Like
 * `useResetWithRecoveryCode`, the mutation resolves to the response union
 * (`sent` | `no-email` | `rate-limited` | `unreachable`) instead of throwing;
 * those are expected outcomes the form renders inline.
 */
export function useRequestEmailReset() {
  return useMutation({
    mutationFn: (input: RequestEmailResetInput) => window.api.invoke('auth.emailReset.request', input),
  });
}
