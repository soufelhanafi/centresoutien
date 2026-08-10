import type { RecentPaymentView, RecentPaymentsFilters } from '../read-models/recent-payment-view';
import type { CenterCode } from '../value-objects/ids';

/**
 * Read port for the cash-desk "recent payments" feed (SOU-198) — the one
 * cross-invoice payment read in the app. Separate from {@link PaymentReader}
 * (which is per-single-invoice) the same way {@link OverdueInvoiceViewReadPort}
 * is separate from `InvoiceRepository`: this serves a **denormalized
 * cross-aggregate read** (`payments ⋈ invoices ⋈ students`), not the append-only
 * write side. The SQLite adapter that owns `payments` implements this port too —
 * one class, several ports.
 *
 * A pure read over append-only rows: it never writes, and it excludes tombstoned
 * payment rows (`deletedAt` — never set on payments today, filtered for
 * uniformity with every sibling read) so it can never resurrect a deleted row.
 */
export interface RecentPaymentsReadPort {
  /**
   * Every live payment/reversal row of `centerCode`, most recent `paidOn` first,
   * within the optional `filters.from`/`filters.to` day window and capped at
   * `filters.limit` rows. Center-scoped like every other read — it never crosses
   * a `centreId` boundary. Both `payment` and `reversal` kinds are returned as-is;
   * netting is the caller's concern.
   */
  listRecentPayments(
    centerCode: CenterCode,
    filters: RecentPaymentsFilters,
  ): Promise<readonly RecentPaymentView[]>;
}
