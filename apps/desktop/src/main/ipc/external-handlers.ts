import { shell } from 'electron';
import type { IpcHandlers } from '../../shared/ipc/contract';
import { isAllowedExternalUrl } from './external-allowlist';

/**
 * The `external.open` handler (SOU-85). Refuses any URL that fails the host
 * allowlist without touching the shell, so a compromised renderer cannot use
 * this channel to launch arbitrary URLs or protocols. Needs no domain use case —
 * it is pure platform glue guarded by a pure predicate.
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
