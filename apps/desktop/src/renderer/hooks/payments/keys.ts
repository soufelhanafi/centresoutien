import type { RecentPaymentsQuery } from '../../lib/payments/recent-payment-view';

/** Query keys for the cash-desk payments module. Recording a payment invalidates `paymentKeys.all`. */
export const paymentKeys = {
  all: ['payments'] as const,
  recent: (query: RecentPaymentsQuery) => ['payments', 'recent', query] as const,
};
