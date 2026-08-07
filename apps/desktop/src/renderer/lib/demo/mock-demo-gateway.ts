import type { DemoMutationResponse, DemoStatusResponse } from './demo-contract';
import type { DemoGateway } from './demo-gateway';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory stand-in for the not-yet-published `demo.*` channels (see
 * `demo-gateway.ts`). Mimics the pinned contract: `status` reports whether the
 * current session is the demo center; `create`/`wipe` ack with
 * `{ relaunching: true }` — in production the main process restarts the app
 * there, so the UI renders the restarting state exactly as it will for real.
 */
export class MockDemoGateway implements DemoGateway {
  private isDemoValue = false;

  /** Test hook: flip the reported demo state without touching `window.api`. */
  setDemoStatus(isDemo: boolean): void {
    this.isDemoValue = isDemo;
  }

  async status(): Promise<DemoStatusResponse> {
    return { isDemo: this.isDemoValue };
  }

  async create(): Promise<DemoMutationResponse> {
    await delay(400);
    this.isDemoValue = true;
    return { relaunching: true };
  }

  async wipe(): Promise<DemoMutationResponse> {
    await delay(400);
    this.isDemoValue = false;
    return { relaunching: true };
  }
}

export const mockDemoGateway = new MockDemoGateway();
