import { useMutation } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';

type ConfirmEmailResetInput = IpcRequest<'auth.emailReset.confirm'>;

/**
 * Verifies the emailed 6-digit code and, only on success, resets the local
 * password and invalidates the device session (SOU-273). Unauthenticated. Like
 * `useResetWithRecoveryCode`, the mutation resolves to the response union
 * (`success` | `invalid-or-expired` | `rate-limited` | `unreachable`) instead of
 * throwing; those are expected outcomes the form renders inline.
 */
export function useConfirmEmailReset() {
  return useMutation({
    mutationFn: (input: ConfirmEmailResetInput) => window.api.invoke('auth.emailReset.confirm', input),
  });
}
