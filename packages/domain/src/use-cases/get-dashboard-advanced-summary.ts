import type { InvoiceRepository } from '../ports/invoice-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { AttendanceRepository, DailyAttendanceCounts } from '../ports/attendance-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { MonthlyFeeAttributionService } from '../services/monthly-fee-attribution-service';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { StudentSubscription } from '../entities/student-subscription';
import type { Holiday } from '../entities/holiday';
import type { DateRange } from '../value-objects/date-range';
import { monthsEndingAt, monthDateRange, monthsBetween } from '../value-objects/month';
import { eachDateInRange } from '../value-objects/date-range';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import { holidayOn } from '../policies/holiday-policy';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../entities/attendance-record';
import {
  DASHBOARD_TREND_WINDOW_MONTHS,
  type DashboardAdvancedSummary,
  type MonthlyRevenuePoint,
  type MonthlyEnrollmentPoint,
  type SubjectRevenueShare,
  type MonthlyEnrollmentActivityPoint,
  type AttendanceHeatmapCell,
} from '../read-models/dashboard-advanced-summary';

export type GetDashboardAdvancedSummaryInput = {
  centerCode: CenterCode;
};

function emptyBreakdown(): Record<AttendanceStatus, number> {
  const breakdown = {} as Record<AttendanceStatus, number>;
  for (const status of ATTENDANCE_STATUSES) breakdown[status] = 0;
  return breakdown;
}

/**
 * The Avancé dashboard's widgets (SOU-100, SOU-230), gated by `dashboard.advanced`
 * (Premium). All reads run in parallel and each is bounded by the center's data,
 * not by student count row-by-row:
 *
 * - **Revenue trend**: `DASHBOARD_TREND_WINDOW_MONTHS` calls to
 *   `InvoiceRepository.listInvoices` (one per month, already a two-query batch
 *   read per SOU-69), summing `netPaidMad` over `issued` invoices — the same
 *   money `ListInvoices` shows per-invoice, just rolled up per month.
 * - **Enrollment evolution & activity**: one `listLiveByCenter` read shared by
 *   both — the active-in-month headcount (`isSubscriptionActiveInMonth`) and the
 *   per-month open/close net churn, both computed in memory per trend month,
 *   never a per-month repository round trip.
 * - **Attendance rate**: one center-wide aggregate query
 *   (`AttendanceRepository.summarizeForCenter`), never one read per student.
 * - **Attendance heatmap**: one center-wide per-day aggregate query
 *   (`summarizeByDayForCenter`) plus the center's holidays, stitched into a cell
 *   per calendar day of the trend window in memory.
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
    private readonly holidays: HolidayRepository,
    private readonly attribution: Pick<MonthlyFeeAttributionService, 'attributedAmountsBySubject'>,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDashboardAdvancedSummaryInput): Promise<DashboardAdvancedSummary> {
    this.plan.require('dashboard.advanced');

    const now = this.clock.now();
    const currentMonth = now.toISOString().slice(0, 7);
    const today = now.toISOString().slice(0, 10);
    const trendMonths = monthsEndingAt(currentMonth, DASHBOARD_TREND_WINDOW_MONTHS);
    const heatmapRange = this.heatmapRange(trendMonths, currentMonth, today);

    const [
      revenueTrend,
      liveSubscriptions,
      attendanceRatePercent,
      subjectRevenueBreakdown,
      dailyCounts,
      holidays,
    ] = await Promise.all([
      this.buildRevenueTrend(input.centerCode, trendMonths),
      this.subscriptions.listLiveByCenter(input.centerCode),
      this.computeAttendanceRatePercent(input.centerCode, currentMonth),
      this.buildSubjectRevenueBreakdown(input.centerCode, currentMonth),
      this.attendance.summarizeByDayForCenter(input.centerCode, heatmapRange),
      this.holidays.listActive(input.centerCode),
    ]);

    return {
      revenueTrend,
      enrollmentEvolution: this.buildEnrollmentEvolution(liveSubscriptions, trendMonths),
      attendanceRatePercent,
      subjectRevenueBreakdown,
      enrollmentActivity: this.buildEnrollmentActivity(liveSubscriptions, trendMonths),
      attendanceHeatmap: this.buildAttendanceHeatmap(heatmapRange, dailyCounts, holidays),
    };
  }

  private heatmapRange(
    trendMonths: readonly string[],
    currentMonth: string,
    today: string,
  ): DateRange {
    const oldestMonth = trendMonths[0] ?? currentMonth;
    return { start: `${oldestMonth}-01`, end: today };
  }

  private async buildRevenueTrend(
    centerCode: CenterCode,
    months: readonly string[],
  ): Promise<readonly MonthlyRevenuePoint[]> {
    return Promise.all(
      months.map(async (month) => {
        const { rows } = await this.invoices.listInvoices(centerCode, { month });
        // Recognized to the invoice's billed month, not the payment date — same
        // convention as MonthlyFeeAttributionService (CLAUDE.md §6).
        const collectedMad = rows
          .filter((row) => row.invoice.status === 'issued')
          .reduce((sum, row) => sum + row.netPaidMad, 0);
        return { month, collectedMad };
      }),
    );
  }

  private buildEnrollmentEvolution(
    liveSubscriptions: readonly StudentSubscription[],
    months: readonly string[],
  ): readonly MonthlyEnrollmentPoint[] {
    return months.map((month) => {
      const activeStudentIds = new Set(
        liveSubscriptions
          .filter((subscription) => isSubscriptionActiveInMonth(subscription, month))
          .map((subscription) => subscription.studentId),
      );
      return { month, activeStudentCount: activeStudentIds.size };
    });
  }

  private buildEnrollmentActivity(
    liveSubscriptions: readonly StudentSubscription[],
    months: readonly string[],
  ): readonly MonthlyEnrollmentActivityPoint[] {
    return months.map((month) => {
      const opened = liveSubscriptions.filter(
        (subscription) => subscription.startMonth === month,
      ).length;
      const closed = liveSubscriptions.filter(
        (subscription) =>
          subscription.endMonth === month && !this.isFormulaSwapClose(subscription, liveSubscriptions),
      ).length;
      return { month, opened, closed };
    });
  }

  /**
   * A close is a formula swap — not a real departure — when the same student has
   * another same-kind subscription starting the month **immediately after** this
   * one's close (SOU-141 close-then-reopen). Such closes are excluded from net churn.
   */
  private isFormulaSwapClose(
    closed: StudentSubscription,
    liveSubscriptions: readonly StudentSubscription[],
  ): boolean {
    const endMonth = closed.endMonth;
    if (endMonth === null) return false;
    return liveSubscriptions.some(
      (candidate) =>
        candidate.id !== closed.id &&
        candidate.studentId === closed.studentId &&
        candidate.kind === closed.kind &&
        monthsBetween(endMonth, candidate.startMonth) === 1,
    );
  }

  private async computeAttendanceRatePercent(centerCode: CenterCode, month: string): Promise<number> {
    const summary = await this.attendance.summarizeForCenter(centerCode, monthDateRange(month));
    const total = ATTENDANCE_STATUSES.reduce((sum, status) => sum + summary[status], 0);
    if (total === 0) return 0;
    return Math.round((summary.present / total) * 100);
  }

  private buildAttendanceHeatmap(
    range: DateRange,
    dailyCounts: readonly DailyAttendanceCounts[],
    holidays: readonly Holiday[],
  ): readonly AttendanceHeatmapCell[] {
    const countsByDate = new Map(dailyCounts.map((day) => [day.date, day.counts]));
    return eachDateInRange(range).map((date) => {
      if (holidayOn(date, holidays)) {
        return { date, ratePercent: null, isHoliday: true, breakdown: emptyBreakdown() };
      }
      const breakdown = countsByDate.get(date) ?? emptyBreakdown();
      const total = ATTENDANCE_STATUSES.reduce((sum, status) => sum + breakdown[status], 0);
      const ratePercent = total === 0 ? null : Math.round((breakdown.present / total) * 100);
      return { date, ratePercent, isHoliday: false, breakdown };
    });
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
      // Matches the read-model contract ("a subject with zero collected fees is
      // omitted") — a largest-remainder split can theoretically hand a subject 0.
      if (amountMad <= 0) continue;
      shares.push({ subjectId, subjectName: subject.name, amountMad });
    }
    return shares.sort((a, b) => b.amountMad - a.amountMad);
  }
}
