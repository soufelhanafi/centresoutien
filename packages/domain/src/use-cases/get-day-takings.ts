import type { RecentPaymentsReadPort } from '../ports/recent-payments-read-port';
import type { DayTakings } from '../read-models/day-takings';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type GetDayTakingsInput = {
  centerCode: CenterCode;
  /** The calendar day to total, inclusive `'YYYY-MM-DD'` on `paidOn`. */
  day: string;
};

/**
 * The cash-desk header's day total (SOU-198): the net money taken on a single day,
 * aggregated in SQL. This exists separately from {@link ListRecentPayments} because the
 * header total must be independent of the feed's row cap — a busy day with more rows
 * than any page still totals correctly. A pure read: it never touches the append-only
 * write path.
 *
 * Gated by `core.invoicing` (the same flag the invoice/payment reads use). Center-scoped:
 * the underlying read never crosses a `centreId` boundary.
 */
export class GetDayTakings {
  constructor(
    private readonly recentPayments: RecentPaymentsReadPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDayTakingsInput): Promise<DayTakings> {
    this.plan.require('core.invoicing');
    return this.recentPayments.getDayTakings(input.centerCode, input.day);
  }
}
