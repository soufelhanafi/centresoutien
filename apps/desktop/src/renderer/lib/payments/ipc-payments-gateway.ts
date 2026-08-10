import type { PaymentsGateway } from './payments-gateway';
import type { RecentPaymentsQuery, RecentPaymentView } from './recent-payment-view';

/**
 * The real {@link PaymentsGateway}: maps `listRecent` onto the `payment.recent`
 * IPC channel (SOU-198), the one cross-invoice payment read. centerCode is
 * injected in main, never sent from the renderer.
 */
class IpcPaymentsGateway implements PaymentsGateway {
  async listRecent(query: RecentPaymentsQuery): Promise<readonly RecentPaymentView[]> {
    const { payments } = await window.api.invoke('payment.recent', {
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
      ...(query.limit !== undefined && { limit: query.limit }),
    });
    return payments;
  }
}

export const ipcPaymentsGateway: PaymentsGateway = new IpcPaymentsGateway();
