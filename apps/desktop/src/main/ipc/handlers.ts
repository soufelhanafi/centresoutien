import type { IpcHandlers } from '../../shared/ipc/contract';

/**
 * IPC handler implementations. Dependencies (like the app version) are injected
 * so handlers stay pure and testable without the Electron `app` object. As the
 * app grows, each handler delegates to a pre-wired domain use case here.
 */
export type HandlerDeps = {
  appVersion: () => string;
};

export function createHandlers(deps: HandlerDeps): IpcHandlers {
  return {
    'app.ping': (request) => ({
      reply: `pong: ${request.message}`,
      appVersion: deps.appVersion(),
    }),
  };
}
