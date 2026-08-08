import type { DemoGateway } from './demo-gateway';
import { demoChannels, type DemoMutationResponse, type DemoStatusResponse } from './demo-contract';

/**
 * The real {@link DemoGateway} over the typed preload bridge (SOU-110). Both
 * mutations are ack-only — the app relaunches right after, so the renderer
 * never reads a data payload from them.
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
