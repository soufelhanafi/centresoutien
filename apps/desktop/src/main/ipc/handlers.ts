import type { PlanId } from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/**
 * IPC handler implementations. Dependencies (app version, active plan) are
 * injected so handlers stay pure and testable without Electron. As the app
 * grows, each handler delegates to a pre-wired domain use case here.
 */
export type HandlerDeps = {
  appVersion: () => string;
  activePlanId: () => PlanId;
};

export function createHandlers(deps: HandlerDeps): IpcHandlers {
  return {
    'app.ping': (request) => ({
      reply: `pong: ${request.message}`,
      appVersion: deps.appVersion(),
    }),
    'plan.get': () => ({
      planId: deps.activePlanId(),
    }),
  };
}
