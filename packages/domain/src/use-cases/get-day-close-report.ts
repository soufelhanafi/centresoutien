import type { RecentPaymentsReadPort } from '../ports/recent-payments-read-port';
import type { DayCloseActivityReadPort } from '../ports/day-close-activity-read-port';
import type { DayCloseReport, DayCloseEncaissement } from '../read-models/day-close-report';
import type { RecentPaymentView, RecentPaymentsFilters } from '../read-models/recent-payment-view';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type GetDayCloseReportInput = {
  centerCode: CenterCode;
  /** The business day to close, inclusive `'YYYY-MM-DD'`. */
  day: string;
};

/**
 * The director's end-of-day "Clôture du jour" report (SOU-300): a read-only
 * snapshot of one business day, composed from three existing reads so the figures
 * can never disagree with the cash-desk header or the invoice list. A pure read —
 * it never touches any write path.
 *
 * The cash figures (`totalCollectedMad`, `collectedByMethod`) come from
 * {@link RecentPaymentsReadPort.getDayTakings}, netted in SQL over the
 * local-business-day (`paidOn`). The encaissements list comes from
 * {@link RecentPaymentsReadPort.listRecentPayments} on the same day, keeping only
 * `payment`-kind rows (reversals are corrections, not takings). The activity counts
 * (subscriptions/enrollments/invoices) come from {@link DayCloseActivityReadPort}
 * over the UTC envelope day. The activity port is range-generic; this use case passes
 * a single-day window (`from === to === day`).
 *
 * Gated by `core.invoicing` (the same flag every invoice/payment read uses).
 * Center-scoped: every underlying read stays within one `centreId`.
 */
export class GetDayCloseReport {
  constructor(
    private readonly recentPayments: RecentPaymentsReadPort,
    private readonly activity: DayCloseActivityReadPort,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDayCloseReportInput): Promise<DayCloseReport> {
    this.plan.require('core.invoicing');

    const { centerCode, day } = input;
    const [takings, payments, activity] = await Promise.all([
      this.recentPayments.getDayTakings(centerCode, day),
      this.recentPayments.listRecentPayments(centerCode, this.dayPaymentsFilter(day)),
      this.activity.getDayCloseActivity(centerCode, { from: day, to: day }),
    ]);

    return {
      day,
      newSubscriptions: activity.newSubscriptions,
      studentsEnrolled: activity.studentsEnrolled,
      invoicesGenerated: activity.invoicesGenerated,
      totalCollectedMad: takings.netMad,
      collectedByMethod: takings.byMethod,
      encaissements: payments.filter(isPayment).map(toEncaissement),
    };
  }

  private dayPaymentsFilter(day: string): RecentPaymentsFilters {
    return { from: day, to: day, limit: DAY_CLOSE_ENCAISSEMENTS_LIMIT };
  }
}

/** Cap on the encaissements list — one business day never exceeds this many rows. */
const DAY_CLOSE_ENCAISSEMENTS_LIMIT = 200;

function isPayment(row: RecentPaymentView): boolean {
  return row.kind === 'payment';
}

function toEncaissement(row: RecentPaymentView): DayCloseEncaissement {
  return {
    studentName: row.studentName?.fr ?? '',
    amountMad: row.amountMad,
    at: row.createdAt.toISOString(),
  };
}
