import type { RecentPaymentsQuery, RecentPaymentView } from './recent-payment-view';
import { ipcPaymentsGateway } from './ipc-payments-gateway';

/**
 * The seam the cash-desk screen depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 */
export interface PaymentsGateway {
  /** The center's cross-invoice payment/reversal rows, most recent `paidOn` first. */
  listRecent(query: RecentPaymentsQuery): Promise<readonly RecentPaymentView[]>;
}

/** The active gateway. */
export const paymentsGateway: PaymentsGateway = ipcPaymentsGateway;
