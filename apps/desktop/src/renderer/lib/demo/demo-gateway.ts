import type { DemoMutationResponse, DemoStatusResponse } from './demo-contract';
import { mockDemoGateway } from './mock-demo-gateway';

/**
 * The seam the demo UI depends on (Dependency Inversion) — mirrors the
 * `InvoicesGateway` pattern. Hooks call this interface, never `window.api`, so
 * the concrete adapter is swappable in one place with no change to any
 * component. Contract pinned in `demo-contract.ts` (SOU-110).
 *
 * The default is the in-memory mock until the backend registers the `demo.*`
 * channels on the shared `ipcContract`; the real IPC adapter then becomes the
 * default here and every component keeps working untouched.
 */
export interface DemoGateway {
  /** Whether the currently-open center is the demo center. */
  status(): Promise<DemoStatusResponse>;
  /** Creates + seeds the demo DB; the app relaunches into demo mode. */
  create(): Promise<DemoMutationResponse>;
  /** Deletes every demo artefact; the app relaunches into the real center. */
  wipe(): Promise<DemoMutationResponse>;
}

export const demoGateway: DemoGateway = mockDemoGateway;
