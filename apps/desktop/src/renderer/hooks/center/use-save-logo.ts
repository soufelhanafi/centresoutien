import { useMutation } from '@tanstack/react-query';
import type { IpcRequest } from '../../../shared/ipc/contract';

/**
 * Uploads the picked logo's bytes over the typed IPC bridge (SOU-28). Main
 * writes them under app data and returns the **relative** path to carry into
 * the next `center.save`. Extension and size are validated by the domain use
 * case (and pre-checked in the picker for instant feedback).
 */
export function useSaveLogo() {
  return useMutation({
    mutationFn: (input: IpcRequest<'center.saveLogo'>) =>
      window.api.invoke('center.saveLogo', input),
  });
}
