import { DomainError, LicenseRestrictedError } from '@centresoutien/domain';
import { ipcContract, isIpcChannel } from '../../shared/ipc/contract';
import type {
  IpcChannel,
  RegisterableIpcHandlers,
  IpcRequest,
  IpcResponse,
} from '../../shared/ipc/contract';
import { encodeDomainError } from '../../shared/ipc/domain-error';
import { isRestrictedModeChannelAllowed } from './restricted-mode';

/**
 * Options for {@link createIpcDispatcher}. `isRestricted` is the live restricted-
 * mode gate (SOU-104): consulted per call, not a startup snapshot, so a successful
 * `license.activate` starts unblocking the other channels in the same process with
 * no restart. `isSetupComplete` is the trusted first-run state (an admin account
 * exists): once complete, the wizard's bootstrap channels close under restriction
 * so an unlicensed, already-configured center can no longer reach them. Both are
 * omitted in unit tests and the pure dispatcher tests; a missing `isSetupComplete`
 * is treated as "not complete", preserving the fresh-install bootstrap allowance.
 */
export type IpcDispatcherOptions = {
  readonly isRestricted?: () => boolean;
  readonly isSetupComplete?: () => boolean;
};

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
export function createIpcDispatcher(
  handlers: RegisterableIpcHandlers,
  options: IpcDispatcherOptions = {},
) {
  return async function dispatch<C extends IpcChannel>(
    channel: C,
    rawRequest: unknown,
  ): Promise<IpcResponse<C>> {
    if (!isIpcChannel(channel)) {
      throw new Error(`Unknown IPC channel: ${String(channel)}`);
    }
    try {
      if (
        options.isRestricted?.() &&
        !isRestrictedModeChannelAllowed(channel, options.isSetupComplete?.() ?? false)
      ) {
        throw new LicenseRestrictedError(channel);
      }
      const method = ipcContract[channel];
      const request = method.request.parse(rawRequest) as IpcRequest<C>;
      const handler = handlers[channel] as
        | ((req: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>)
        | undefined;
      if (!handler) {
        throw new Error(`No handler registered for IPC channel: ${String(channel)}`);
      }
      const response = await handler(request);
      return method.response.parse(response) as IpcResponse<C>;
    } catch (error) {
      if (error instanceof DomainError) {
        throw new Error(encodeDomainError({ code: domainErrorCode(error), message: error.message }));
      }
      throw error;
    }
  };
}
