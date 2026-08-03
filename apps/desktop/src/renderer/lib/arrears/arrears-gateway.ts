import type { ArrearsFilters, ArrearsSummaryView } from './arrears-view';
import { mockArrearsGateway } from './mock-arrears-gateway';

/**
 * The seam the arrears (Impayés) screen depends on (Dependency Inversion).
 * Hooks call this interface, never `window.api` directly, so the concrete
 * adapter is swappable in one place with no change to any component.
 *
 * ## Contract status (SOU-103)
 *
 * The domain-backend counterpart (read model + IPC channel, plausibly
 * `arrears.list`) had not landed on `packages/domain` / the IPC contract at
 * the time this screen was built in a parallel worktree, so only the mock
 * adapter exists so far — see `mock-arrears-gateway.ts` for the exact shape
 * expected back. Once the real channel ships, add `ipc-arrears-gateway.ts`
 * (same shape as `ipc-invoices-gateway.ts`) and flip the binding below to it;
 * no other file in this module needs to change.
 */
export interface ArrearsGateway {
  list(filters: ArrearsFilters): Promise<ArrearsSummaryView>;
}

/** The active gateway. */
export const arrearsGateway: ArrearsGateway = mockArrearsGateway;
