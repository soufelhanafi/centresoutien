import type { DemoMutationResponse, DemoStatusResponse } from './demo-contract';
import { ipcDemoGateway } from './ipc-demo-gateway';

/**
 * The seam the demo UI depends on (Dependency Inversion) — mirrors the
 * `InvoicesGateway` pattern. Hooks call this interface, never `window.api`, so
 * the concrete adapter is swappable in one place with no change to any
 * component. Contract pinned in `demo-contract.ts` (SOU-110).
 *
 * The default is the real IPC adapter (the backend registered the `demo.*`
 * channels on the shared `ipcContract`); tests spy on the exported singleton.
 */
export interface DemoGateway {
  /** Whether the currently-open center is the demo center. */
  status(): Promise<DemoStatusResponse>;
  /** Creates + seeds the demo DB and hot-swaps into it; resolves `{ isDemo: true }`. */
  create(): Promise<DemoMutationResponse>;
  /** Swaps back to the real center and deletes every demo artefact; resolves `{ isDemo: false }`. */
  wipe(): Promise<DemoMutationResponse>;
}

export const demoGateway: DemoGateway = ipcDemoGateway;
