import type { PaymentMethod } from '@centresoutien/domain';
import type { IpcRequest } from '../../../shared/ipc/contract';
import type { PaymentsGateway } from './payments-gateway';
import type { RecentPaymentsQuery, RecentPaymentView } from './recent-payment-view';
import type { DayTakingsView } from './day-takings-view';

// Contract-first (SOU-225): the `method` filter is added to `payment.recent`'s
// request schema by the domain-backend branch in parallel. Typing the request as a
// superset of the current contract keeps the renderer sending `method` today; main's
// Zod schema strips it until that branch lands, so the filter simply no-ops rather
// than erroring. Once the schema gains `method`, this intersection is redundant.
type RecentPaymentsRequest = IpcRequest<'payment.recent'> & { method?: PaymentMethod };

/**
 * The real {@link PaymentsGateway}: maps `listRecent` onto `payment.recent` (the
 * scrolling feed) and `getDayTakings` onto `payment.takings` (the cap-free SQL
 * day aggregate behind the header). centerCode is injected in main, never sent
 * from the renderer.
 */
class IpcPaymentsGateway implements PaymentsGateway {
  async listRecent(query: RecentPaymentsQuery): Promise<readonly RecentPaymentView[]> {
    const request: RecentPaymentsRequest = {
      ...(query.from !== undefined && { from: query.from }),
      ...(query.to !== undefined && { to: query.to }),
      ...(query.method !== undefined && { method: query.method }),
      ...(query.limit !== undefined && { limit: query.limit }),
    };
    const { payments } = await window.api.invoke('payment.recent', request);
    return payments;
  }

  async getDayTakings(day: string): Promise<DayTakingsView> {
    return window.api.invoke('payment.takings', { day });
  }
}

export const ipcPaymentsGateway: PaymentsGateway = new IpcPaymentsGateway();
