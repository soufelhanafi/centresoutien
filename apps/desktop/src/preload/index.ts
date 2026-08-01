import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc/api';
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipc/contract';

/**
 * The only bridge across the isolation boundary. It forwards typed invocations
 * to main; it exposes no Node, no ipcRenderer, nothing else.
 *
 * A rejected `DomainError` carries its stable `code` inside the rejection's
 * *message* (the main dispatcher encodes it — see `shared/ipc/domain-error`),
 * because neither the Electron IPC bridge nor this contextBridge preserves custom
 * error properties: only `message` / `stack` survive. So we pass the rejection
 * through untouched and let the renderer decode the code from `error.message`
 * (see `enrollment-error.ts`). Decoding here would be pointless — the re-attached
 * `code` would be stripped again crossing the contextBridge.
 */
const api: DesktopApi = {
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, request),
};

contextBridge.exposeInMainWorld('api', api);
