import type { RecentPaymentDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of one append-only ledger row for the cash-desk feed
 * (SOU-198). A direct alias of the boundary's `recentPaymentViewSchema` (the
 * single source of truth in `shared/ipc/contract`), so the renderer shape can
 * never drift from what the `payment.recent` channel actually returns.
 */
export type RecentPaymentView = RecentPaymentDto;

/**
 * Optional inclusive `'YYYY-MM-DD'` day window + row cap for the recent-payments
 * read. A single day = `from === to` (today's takings); an omitted bound is
 * open-ended. `limit` is clamped again in the domain use case.
 */
export type RecentPaymentsQuery = {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
};
