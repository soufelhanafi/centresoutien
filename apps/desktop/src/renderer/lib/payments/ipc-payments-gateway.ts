import type { PaymentsGateway } from './payments-gateway';
import type { RecentPaymentsQuery, RecentPaymentView } from './recent-payment-view';
import type { DayTakingsView } from './day-takings-view';

/**
 * The real {@link PaymentsGateway}: maps `listRecent` onto `payment.recent` (the
 * scrolling feed) and `getDayTakings` onto `payment.takings` (the cap-free SQL
 * day aggregate behind the header). centerCode is injected in main, never sent
 * from the renderer.
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

  async getDayTakings(day: string): Promise<DayTakingsView> {
    return window.api.invoke('payment.takings', { day });
  }
}

export const ipcPaymentsGateway: PaymentsGateway = new IpcPaymentsGateway();
