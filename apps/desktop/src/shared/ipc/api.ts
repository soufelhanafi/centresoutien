import type { IpcChannel, IpcRequest, IpcResponse } from './contract';

/**
 * The surface the preload bridge exposes on `window.api`. Defined in shared so
 * the preload (implementation) and renderer (consumer) agree on one type.
 */
export interface DesktopApi {
  invoke<C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>>;
}
