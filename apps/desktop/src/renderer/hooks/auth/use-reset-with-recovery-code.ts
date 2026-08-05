import { useMutation } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';

type ResetWithCodeInput = IpcRequest<'auth.resetWithCode'>;

/**
 * Redeems a recovery code and sets a new password over the typed IPC bridge
 * (SOU-156, primary offline reset path built on SOU-154). Like `useLogin`, the
 * mutation resolves to the response union — `success` or `locked-out` — instead
 * of throwing; those are expected outcomes the form renders inline. A thrown
 * error means the IPC call itself failed.
 */
export function useResetWithRecoveryCode() {
  return useMutation({
    mutationFn: (input: ResetWithCodeInput) => window.api.invoke('auth.resetWithCode', input),
  });
}
