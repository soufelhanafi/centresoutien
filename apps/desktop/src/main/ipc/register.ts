import type { IpcMain } from 'electron';
import { ipcContract } from '../../shared/ipc/contract';
import type { IpcChannel, IpcHandlers } from '../../shared/ipc/contract';
import { createIpcDispatcher } from './dispatcher';

/**
 * Wire the validated dispatcher onto `ipcMain`. Only channels declared in the
 * contract are registered — the renderer cannot reach anything else.
 */
export function registerIpc(ipcMain: IpcMain, handlers: IpcHandlers): void {
  const dispatch = createIpcDispatcher(handlers);
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, (_event, rawRequest: unknown) => dispatch(channel, rawRequest));
  }
}
