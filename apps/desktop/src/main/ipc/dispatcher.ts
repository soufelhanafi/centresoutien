import { ipcContract, isIpcChannel } from '../../shared/ipc/contract';
import type { IpcChannel, IpcHandlers, IpcRequest, IpcResponse } from '../../shared/ipc/contract';

/**
 * Builds a validated dispatch function from a set of handlers. Requests are
 * parsed against the channel's schema before the handler runs, and responses
 * are parsed before they leave — so a contract violation on either side fails
 * loudly instead of leaking a bad shape across the IPC boundary. Pure and
 * Electron-free, so it unit-tests without launching the app.
 */
export function createIpcDispatcher(handlers: IpcHandlers) {
  return async function dispatch<C extends IpcChannel>(
    channel: C,
    rawRequest: unknown,
  ): Promise<IpcResponse<C>> {
    if (!isIpcChannel(channel)) {
      throw new Error(`Unknown IPC channel: ${String(channel)}`);
    }
    const method = ipcContract[channel];
    const request = method.request.parse(rawRequest) as IpcRequest<C>;
    const handler = handlers[channel] as (req: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>;
    const response = await handler(request);
    return method.response.parse(response) as IpcResponse<C>;
  };
}
