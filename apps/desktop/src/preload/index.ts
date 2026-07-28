import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../shared/ipc/api';
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipc/contract';

/**
 * The only bridge across the isolation boundary. It forwards typed invocations
 * to main; it exposes no Node, no ipcRenderer, nothing else.
 */
const api: DesktopApi = {
  invoke: <C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, request),
};

contextBridge.exposeInMainWorld('api', api);
