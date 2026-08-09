import type { DemoGateway } from './demo-gateway';
import { demoChannels, type DemoMutationResponse, type DemoStatusResponse } from './demo-contract';

/**
 * The real {@link DemoGateway} over the typed preload bridge (SOU-110). Both
 * mutations resolve with the resulting `{ isDemo }` AFTER the in-process DB
 * hot-swap completes (SOU-186) — the renderer reacts off that resolved value,
 * with no process restart and no BrowserWindow reload.
 */
class IpcDemoGateway implements DemoGateway {
  status(): Promise<DemoStatusResponse> {
    return window.api.invoke(demoChannels.status, {});
  }

  create(): Promise<DemoMutationResponse> {
    return window.api.invoke(demoChannels.create, {});
  }

  wipe(): Promise<DemoMutationResponse> {
    return window.api.invoke(demoChannels.wipe, {});
  }
}

export const ipcDemoGateway: DemoGateway = new IpcDemoGateway();
