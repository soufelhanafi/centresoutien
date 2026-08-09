import { shell } from 'electron';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { isAllowedExternalUrl } from './external-allowlist';

/**
 * Pure platform glue — no domain use case — so the whole security decision lives
 * in the allowlist predicate: a compromised renderer cannot use this channel to
 * launch arbitrary URLs or non-https protocols.
 */
export function createExternalHandlers(): Pick<IpcHandlers, 'external.open'> {
  return {
    'external.open': async (request) => {
      if (!isAllowedExternalUrl(request.url)) return { opened: false };
      await shell.openExternal(request.url);
      return { opened: true };
    },
  };
}
