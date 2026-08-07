import type { IpcMain } from 'electron';
import { ipcContract } from '../../shared/ipc/contract';
import type { IpcChannel, RegisterableIpcHandlers } from '../../shared/ipc/contract';
import { createIpcDispatcher, type IpcDispatcherOptions } from './dispatcher';

/**
 * Wire the validated dispatcher onto `ipcMain`. Only channels declared in the
 * contract AND actually present in `handlers` are registered — a channel with no
 * handler (in production, the dev-only `plan.set`; see its contract entry) is
 * never wired, so an `invoke` for it reaches no `ipcMain.handle` and is rejected.
 * `options.isRestricted` carries the live SOU-104 license hard-lock into the
 * dispatcher so the boundary — not just the renderer — enforces restricted mode.
 */
export function registerIpc(
  ipcMain: IpcMain,
  handlers: RegisterableIpcHandlers,
  options: IpcDispatcherOptions = {},
): void {
  const dispatch = createIpcDispatcher(handlers, options);
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    if (!(channel in handlers)) continue;
    ipcMain.handle(channel, (_event, rawRequest: unknown) => dispatch(channel, rawRequest));
  }
}
