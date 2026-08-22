import type { RecentPaymentView, RecentPaymentsFilters } from '../read-models/recent-payment-view';
import type { DayTakings } from '../read-models/day-takings';
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
   * a `centreId` boundary. Both `payment` and `reversal` kinds are returned unless
   * `filters.kind` narrows to one (the day-close encaissements read passes `'payment'`
   * so reversals never consume the limit); netting is otherwise the caller's concern.
   */
  listRecentPayments(
    centerCode: CenterCode,
    filters: RecentPaymentsFilters,
  ): Promise<readonly RecentPaymentView[]>;

  /**
   * The net money taken by `centerCode` on `day` (`'YYYY-MM-DD'`, inclusive), netted
   * **in SQL** (`Σ payments − Σ reversals`) so the total never depends on a row cap —
   * a day with more rows than any feed page still totals correctly. Center-scoped and
   * tombstone-hiding like every sibling read. Always resolves a fully-populated
   * {@link DayTakings}: a day with no rows returns `netMad: 0`, `paymentCount: 0`, and
   * all four `byMethod` keys at `0` — never null.
   */
  getDayTakings(centerCode: CenterCode, day: string): Promise<DayTakings>;
}
