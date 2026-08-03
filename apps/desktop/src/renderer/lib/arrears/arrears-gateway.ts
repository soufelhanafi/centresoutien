import type { ArrearsFilters, ArrearsSummaryView } from './arrears-view';
import { ipcArrearsGateway } from './ipc-arrears-gateway';

/**
 * The seam the arrears (Impayés) screen depends on (Dependency Inversion).
 * Hooks call this interface, never `window.api` directly, so the concrete
 * adapter is swappable in one place with no change to any component.
 */
export interface ArrearsGateway {
  list(filters: ArrearsFilters): Promise<ArrearsSummaryView>;
}

/** The active gateway. `mock-arrears-gateway.ts` remains for local/manual testing. */
export const arrearsGateway: ArrearsGateway = ipcArrearsGateway;
