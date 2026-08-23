import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';
import { ownerEmailQueryKey } from './use-owner-email';

type SetOwnerEmailInput = IpcRequest<'account.ownerEmail.set'>;

/**
 * Stores (or clears) the owner's contact email over the typed IPC bridge
 * (SOU-273). A non-empty address is validated + normalized by the domain Email
 * VO in main, which rejects with `InvalidEmailError` — the caller maps that via
 * `mapOwnerEmailError`. On success the get query is invalidated so the field
 * re-renders from the stored canonical value.
 */
export function useSetOwnerEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetOwnerEmailInput) => window.api.invoke('account.ownerEmail.set', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ownerEmailQueryKey });
    },
  });
}
