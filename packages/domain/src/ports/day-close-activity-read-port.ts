import type { CenterCode } from '../value-objects/ids';

/** Inclusive `'YYYY-MM-DD'` day window; a single day is `from === to`. */
export type DayCloseActivityRange = {
  readonly from: string; // inclusive 'YYYY-MM-DD' lower bound
  readonly to: string; // inclusive 'YYYY-MM-DD' upper bound
};

/**
 * The non-money activity counts of a {@link DayCloseReport}: new subscriptions
 * (split by formula kind), students enrolled, and issued invoices (count + total
 * billed). Kept separate from {@link RecentPaymentsReadPort} (which owns the cash
 * figures) because these are counted over a different boundary — the **UTC
 * envelope day** (`created_at` for subscriptions/enrollments, `issued_at` for
 * invoices, sliced to `YYYY-MM-DD`) — not the local-business-day `paidOn`.
 */
export type DayCloseActivityCounts = {
  readonly newSubscriptions: {
    readonly regular: number;
    readonly examPrep: number;
    readonly total: number;
  };
  readonly studentsEnrolled: number;
  readonly invoicesGenerated: {
    readonly count: number;
    readonly totalBilledMad: number;
  };
};

/**
 * Read port for the day-close activity counts (SOU-300). Range-generic on purpose:
 * the use case passes `from === to === day` today, but a later weekly/monthly close
 * is then a thin add over the same query. Center-scoped like every sibling read — it
 * never crosses a `centreId` boundary — and tombstone-hiding: soft-deleted
 * subscriptions/enrollments/invoices are excluded so a resurrected row can never
 * inflate a count.
 *
 * All three figures count by the **UTC envelope day** (`created_at` / `issued_at`
 * sliced to `YYYY-MM-DD`), within the inclusive `[range.from, range.to]` window.
 * `invoicesGenerated` counts issued invoices only, with `totalBilledMad` reusing the
 * app's existing invoice total derivation (never a re-invented money sum).
 */
export interface DayCloseActivityReadPort {
  getDayCloseActivity(
    centerCode: CenterCode,
    range: DayCloseActivityRange,
  ): Promise<DayCloseActivityCounts>;
}
