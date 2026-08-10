import type { RecentPaymentsReadPort } from '../ports/recent-payments-read-port';
import type { RecentPaymentView, RecentPaymentsFilters } from '../read-models/recent-payment-view';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

/** Rows returned when the caller passes no `limit` — a full cash-desk feed page. */
export const RECENT_PAYMENTS_DEFAULT_LIMIT = 50;
/** Hard ceiling on a single feed page — the feed can never return unbounded rows,
 *  mirroring how every list read in the app bounds its result. */
export const RECENT_PAYMENTS_MAX_LIMIT = 200;

export type ListRecentPaymentsInput = {
  centerCode: CenterCode;
  /** Inclusive `'YYYY-MM-DD'` lower bound on `paidOn`; omit for open-ended. */
  from?: string;
  /** Inclusive `'YYYY-MM-DD'` upper bound on `paidOn`; a single "today" = `from === to`. */
  to?: string;
  /** Requested page size; clamped to `[1, RECENT_PAYMENTS_MAX_LIMIT]`, defaults to
   *  `RECENT_PAYMENTS_DEFAULT_LIMIT` when omitted. */
  limit?: number;
};

/**
 * The read model behind the cash-desk `/payments` page (SOU-198): the center's
 * append-only payment ledger **across all invoices**, most recent first, within an
 * optional day/date-range window. This is the one cross-invoice payment read — the
 * per-single-invoice ledger stays {@link GetInvoicePaymentSummary}. A pure read: it
 * never touches the append-only write path.
 *
 * Gated by `core.invoicing` (the same flag the invoice/payment reads use). The `limit`
 * is clamped defensively here — a below-1 or absurdly large request can never make the
 * feed return unbounded rows, independent of what the IPC schema already validated.
 * Center-scoped: the underlying read never crosses a `centreId` boundary.
 */
export class ListRecentPayments {
  constructor(
    private readonly recentPayments: RecentPaymentsReadPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListRecentPaymentsInput): Promise<readonly RecentPaymentView[]> {
    this.plan.require('core.invoicing');

    const filters: RecentPaymentsFilters = {
      limit: this.clampLimit(input.limit),
      ...(input.from !== undefined && { from: input.from }),
      ...(input.to !== undefined && { to: input.to }),
    };
    return this.recentPayments.listRecentPayments(input.centerCode, filters);
  }

  private clampLimit(requested: number | undefined): number {
    if (requested === undefined) return RECENT_PAYMENTS_DEFAULT_LIMIT;
    const floored = Math.floor(requested);
    if (floored < 1) return 1;
    return Math.min(floored, RECENT_PAYMENTS_MAX_LIMIT);
  }
}
