import type { IpcChannel, IpcRequest, IpcResponse } from './contract';
import type { CenterChangedEvent } from './center-events';
import type { UpdateStatusEvent } from './update-events';

/**
 * The surface the preload bridge exposes on `window.api`. Defined in shared so
 * the preload (implementation) and renderer (consumer) agree on one type.
 */
export interface DesktopApi {
  invoke<C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>>;
  /**
   * Subscribe to the post-switch "center changed" push event (SOU-96). The
   * listener fires after a live center hot-swap completes; the renderer should
   * reset its query caches and re-read the now-open center. Returns an
   * unsubscribe function — call it on unmount to detach the ipcRenderer listener.
   */
  onCenterChanged(listener: (event: CenterChangedEvent) => void): () => void;
  /**
   * Subscribe to updater status (SOU-87). Fires as electron-updater checks,
   * downloads, and finishes. Returns an unsubscribe function — call it on
   * unmount to detach the ipcRenderer listener.
   */
  onUpdateStatus(listener: (event: UpdateStatusEvent) => void): () => void;
  /** Ask main to quit and install a downloaded update now (SOU-87). */
  restartNow(): void;
}
