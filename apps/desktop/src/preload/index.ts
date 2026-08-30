import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi } from '../shared/ipc/api';
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipc/contract';
import { CENTER_CHANGED_EVENT, type CenterChangedEvent } from '../shared/ipc/center-events';
import {
  UPDATE_STATUS_EVENT,
  UPDATE_RESTART_COMMAND,
  type UpdateStatusEvent,
} from '../shared/ipc/update-events';
import { JOIN_PROGRESS_EVENT, type JoinProgressEvent } from '../shared/ipc/join-progress-events';

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
  // Post-switch push event (SOU-96). Only the payload crosses the bridge — never
  // the raw ipcRenderer or the `IpcRendererEvent` — and the returned disposer
  // detaches the exact listener that was added.
  onCenterChanged: (listener: (event: CenterChangedEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: CenterChangedEvent): void =>
      listener(payload);
    ipcRenderer.on(CENTER_CHANGED_EVENT, subscription);
    return () => ipcRenderer.removeListener(CENTER_CHANGED_EVENT, subscription);
  },
  onUpdateStatus: (listener: (event: UpdateStatusEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: UpdateStatusEvent): void =>
      listener(payload);
    ipcRenderer.on(UPDATE_STATUS_EVENT, subscription);
    return () => ipcRenderer.removeListener(UPDATE_STATUS_EVENT, subscription);
  },
  restartNow: (): void => ipcRenderer.send(UPDATE_RESTART_COMMAND),
  onJoinProgress: (listener: (event: JoinProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, payload: JoinProgressEvent): void =>
      listener(payload);
    ipcRenderer.on(JOIN_PROGRESS_EVENT, subscription);
    return () => ipcRenderer.removeListener(JOIN_PROGRESS_EVENT, subscription);
  },
};

contextBridge.exposeInMainWorld('api', api);
