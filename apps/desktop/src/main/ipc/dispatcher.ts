import { DomainError } from '@centresoutien/domain';
import { ipcContract, isIpcChannel } from '../../shared/ipc/contract';
import type { IpcChannel, IpcHandlers, IpcRequest, IpcResponse } from '../../shared/ipc/contract';
import { encodeDomainError } from '../../shared/ipc/domain-error';

/**
 * A domain error's stable machine code: subclasses expose a `code` field (e.g.
 * `'group-full'`); the ones that don't fall back to the class name. Encoded into
 * the thrown message so it survives Electron's error flattening — see
 * `shared/ipc/domain-error`.
 */
function domainErrorCode(error: DomainError): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : error.name;
}

/**
 * Builds a validated dispatch function from a set of handlers. Requests are
 * parsed against the channel's schema before the handler runs, and responses
 * are parsed before they leave — so a contract violation on either side fails
 * loudly instead of leaking a bad shape across the IPC boundary. A thrown
 * `DomainError` is re-thrown with its `code` encoded into the message so the
 * renderer can resolve a specific localized message across the IPC bridge.
 * Pure and Electron-free, so it unit-tests without launching the app.
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
    let response: IpcResponse<C>;
    try {
      response = await handler(request);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new Error(encodeDomainError({ code: domainErrorCode(error), message: error.message }));
      }
      throw error;
    }
    return method.response.parse(response) as IpcResponse<C>;
  };
}
