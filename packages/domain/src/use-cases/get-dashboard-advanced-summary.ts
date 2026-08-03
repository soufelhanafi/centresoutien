import type { InvoiceRepository } from '../ports/invoice-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { AttendanceRepository } from '../ports/attendance-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { MonthlyFeeAttributionService } from '../services/monthly-fee-attribution-service';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import { monthsEndingAt, monthDateRange } from '../value-objects/month';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import { ATTENDANCE_STATUSES } from '../entities/attendance-record';
import {
  DASHBOARD_TREND_WINDOW_MONTHS,
  type DashboardAdvancedSummary,
  type MonthlyRevenuePoint,
  type MonthlyEnrollmentPoint,
  type SubjectRevenueShare,
} from '../read-models/dashboard-advanced-summary';

export type GetDashboardAdvancedSummaryInput = {
  centerCode: CenterCode;
};

/**
 * The Avancé dashboard's four widgets (SOU-100), gated by `dashboard.advanced`
 * (Premium). All four reads run in parallel and each is bounded by the center's
 * data, not by student count row-by-row:
 *
 * - **Revenue trend**: `DASHBOARD_TREND_WINDOW_MONTHS` calls to
 *   `InvoiceRepository.listInvoices` (one per month, already a two-query batch
 *   read per SOU-69), summing `netPaidMad` over `issued` invoices — the same
 *   money `ListInvoices` shows per-invoice, just rolled up per month.
 * - **Enrollment evolution**: one `listLiveByCenter` read, then the
 *   already-active-in-month check (`isSubscriptionActiveInMonth`,
 *   `GenerateMonthlyInvoices`' own rule) applied in memory per trend month —
 *   never a per-month repository round trip.
 * - **Attendance rate**: one center-wide aggregate query
 *   (`AttendanceRepository.summarizeForCenter`), never one read per student.
 * - **Per-subject breakdown**: `MonthlyFeeAttributionService.attributedAmountsBySubject`
 *   (SOU-100 KICKOFF: reuses `TeacherFeeAttributionPolicy`'s split, grouped by
 *   subject), resolved to bilingual subject names in one `listAll` read.
 */
export class GetDashboardAdvancedSummary {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly attendance: AttendanceRepository,
    private readonly subjects: SubjectRepository,
    private readonly attribution: Pick<MonthlyFeeAttributionService, 'attributedAmountsBySubject'>,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDashboardAdvancedSummaryInput): Promise<DashboardAdvancedSummary> {
    this.plan.require('dashboard.advanced');

    const currentMonth = this.clock.now().toISOString().slice(0, 7);
    const trendMonths = monthsEndingAt(currentMonth, DASHBOARD_TREND_WINDOW_MONTHS);

    const [revenueTrend, enrollmentEvolution, attendanceRatePercent, subjectRevenueBreakdown] =
      await Promise.all([
        this.buildRevenueTrend(input.centerCode, trendMonths),
        this.buildEnrollmentEvolution(input.centerCode, trendMonths),
        this.computeAttendanceRatePercent(input.centerCode, currentMonth),
        this.buildSubjectRevenueBreakdown(input.centerCode, currentMonth),
      ]);

    return { revenueTrend, enrollmentEvolution, attendanceRatePercent, subjectRevenueBreakdown };
  }

  private async buildRevenueTrend(
    centerCode: CenterCode,
    months: readonly string[],
  ): Promise<readonly MonthlyRevenuePoint[]> {
    return Promise.all(
      months.map(async (month) => {
        const rows = await this.invoices.listInvoices(centerCode, { month });
        const collectedMad = rows
          .filter((row) => row.invoice.status === 'issued')
          .reduce((sum, row) => sum + row.netPaidMad, 0);
        return { month, collectedMad };
      }),
    );
  }

  private async buildEnrollmentEvolution(
    centerCode: CenterCode,
    months: readonly string[],
  ): Promise<readonly MonthlyEnrollmentPoint[]> {
    const liveSubscriptions = await this.subscriptions.listLiveByCenter(centerCode);
    return months.map((month) => {
      const activeStudentIds = new Set(
        liveSubscriptions
          .filter((subscription) => isSubscriptionActiveInMonth(subscription, month))
          .map((subscription) => subscription.studentId),
      );
      return { month, activeStudentCount: activeStudentIds.size };
    });
  }

  private async computeAttendanceRatePercent(centerCode: CenterCode, month: string): Promise<number> {
    const summary = await this.attendance.summarizeForCenter(centerCode, monthDateRange(month));
    const total = ATTENDANCE_STATUSES.reduce((sum, status) => sum + summary[status], 0);
    if (total === 0) return 0;
    return Math.round((summary.present / total) * 100);
  }

  private async buildSubjectRevenueBreakdown(
    centerCode: CenterCode,
    month: string,
  ): Promise<readonly SubjectRevenueShare[]> {
    const [attributedBySubject, liveSubjects] = await Promise.all([
      this.attribution.attributedAmountsBySubject(centerCode, month),
      this.subjects.listAll(centerCode),
    ]);
    const subjectById = new Map(liveSubjects.map((subject) => [subject.id, subject]));

    const shares: SubjectRevenueShare[] = [];
    for (const [subjectId, amountMad] of attributedBySubject) {
      const subject = subjectById.get(subjectId);
      // A subject in-use by a formula can't be tombstoned (SubjectInUseError) —
      // this is defensive, mirroring GenerateMonthlyInvoices' unresolved-formula skip.
      if (!subject) continue;
      shares.push({ subjectId, subjectName: subject.name, amountMad });
    }
    return shares.sort((a, b) => b.amountMad - a.amountMad);
  }
}
