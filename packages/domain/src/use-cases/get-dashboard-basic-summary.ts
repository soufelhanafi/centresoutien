import type { SessionRepository } from '../ports/session-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { DashboardBasicSummary } from '../read-models/dashboard-basic-summary';
import { paymentStatusOf } from '../policies/payment-status';

export type GetDashboardBasicSummaryInput = {
  centerCode: CenterCode;
};

/**
 * The Basique dashboard's three KPI cards (SOU-100), gated by `dashboard.basic`
 * (every plan). Reads three independent, already-indexed aggregates in
 * parallel — no per-row scan of students or sessions beyond what each
 * repository already does for its own screen — so the whole call stays well
 * under the 500ms/500-student acceptance target with no new query surface
 * beyond what `session.week`-style reads and `ListInvoices` already prove out.
 *
 * `unpaidInvoiceCount` counts the current calendar month's `issued` invoices
 * whose derived `PaymentStatus` (SOU-93) is not `paid` — drafts and cancelled
 * invoices are excluded, matching `ListInvoices`' own status derivation so the
 * two screens can never disagree on what "unpaid" means.
 */
export class GetDashboardBasicSummary {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly students: StudentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDashboardBasicSummaryInput): Promise<DashboardBasicSummary> {
    this.plan.require('dashboard.basic');

    const today = this.clock.now().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const [todaysSessions, activeStudentCount, monthInvoices] = await Promise.all([
      this.sessions.listForRange(input.centerCode, { start: today, end: today }),
      this.students.countActive(input.centerCode),
      this.invoices.listInvoices(input.centerCode, { month }),
    ]);

    const unpaidInvoiceCount = monthInvoices.filter(
      (row) =>
        row.invoice.status === 'issued' && paymentStatusOf(row.totalMad, row.netPaidMad) !== 'paid',
    ).length;

    return {
      todaysSessionCount: todaysSessions.length,
      activeStudentCount,
      unpaidInvoiceCount,
    };
  }
}
