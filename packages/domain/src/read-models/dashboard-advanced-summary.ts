import type { SubjectId } from '../entities/subject';
import type { AttendanceStatus } from '../entities/attendance-record';

/** How many trailing months (inclusive of the current one) the trend widgets cover — SOU-100 KICKOFF. */
export const DASHBOARD_TREND_WINDOW_MONTHS = 6;

/** One month's collected revenue (MAD centimes) — a point on the revenue-trend chart. */
export type MonthlyRevenuePoint = {
  readonly month: string; // 'YYYY-MM'
  readonly collectedMad: number;
};

/** One month's live-subscription headcount — a point on the enrollment-evolution chart. */
export type MonthlyEnrollmentPoint = {
  readonly month: string; // 'YYYY-MM'
  readonly activeStudentCount: number;
};

/** One subject's share of the current month's collected revenue — a bar on the per-subject breakdown. */
export type SubjectRevenueShare = {
  readonly subjectId: SubjectId;
  readonly subjectName: { readonly fr: string; readonly ar: string };
  readonly amountMad: number;
};

/**
 * One trend month's subscription open/close counts — a grouped bar (new vs
 * closed) on the enrollment-activity chart (SOU-230). `closed` is **net churn**:
 * a close that is really a formula swap (SOU-141 close-then-reopen — the same
 * student reopening the same track the very next month) is excluded, so only
 * genuine departures count. Both are counts of subscription *events*, not
 * distinct students.
 */
export type MonthlyEnrollmentActivityPoint = {
  readonly month: string; // 'YYYY-MM'
  readonly opened: number;
  readonly closed: number;
};

/**
 * One calendar day's center-wide attendance rate — a cell on the attendance
 * heatmap (SOU-230).
 *
 * - `ratePercent` is `round(present / (present + absent + excused + late) * 100)`
 *   — `late` is **not** counted as present, matching {@link attendanceRatePercent}.
 * - A **holiday** is `ratePercent: null, isHoliday: true` (greyed out) — no rate
 *   is computed even if stray records exist.
 * - A non-holiday day with **zero** roll-call records is `ratePercent: null,
 *   isHoliday: false` (empty, not 0%).
 * - `breakdown` carries the per-status counts for the hover tooltip; it is all
 *   zeros on a holiday or a record-less day.
 */
export type AttendanceHeatmapCell = {
  readonly date: string; // 'YYYY-MM-DD'
  readonly ratePercent: number | null;
  readonly isHoliday: boolean;
  readonly breakdown: Readonly<Record<AttendanceStatus, number>>;
};

/**
 * The Avancé dashboard's four widgets (SOU-100, `dashboard.advanced` —
 * Premium): a {@link DASHBOARD_TREND_WINDOW_MONTHS}-month revenue trend and
 * enrollment evolution, the current month's attendance rate, and the current
 * month's collected revenue split by subject. This is a **cross-aggregate
 * read model**, not an entity: no sync envelope, never persisted or written
 * back. Produced by {@link GetDashboardAdvancedSummary}.
 */
export type DashboardAdvancedSummary = {
  /** Oldest month first, ending at the current calendar month. */
  readonly revenueTrend: readonly MonthlyRevenuePoint[];
  /** Same window and ordering as {@link revenueTrend}. */
  readonly enrollmentEvolution: readonly MonthlyEnrollmentPoint[];
  /**
   * `present` records as a percentage of every roll-call outcome
   * (`present + absent + excused + late`) this calendar month, rounded to the
   * nearest integer. `0` when the center has recorded no attendance yet this
   * month — never `NaN`.
   */
  readonly attendanceRatePercent: number;
  /** Current calendar month, highest revenue first. A subject with zero collected fees is omitted. */
  readonly subjectRevenueBreakdown: readonly SubjectRevenueShare[];
  /**
   * Per trend month, subscriptions opened vs (net) closed — same
   * {@link DASHBOARD_TREND_WINDOW_MONTHS} window and oldest-first ordering as
   * {@link revenueTrend}. A formula-swap close is excluded from `closed`.
   */
  readonly enrollmentActivity: readonly MonthlyEnrollmentActivityPoint[];
  /**
   * One cell per calendar day across the same {@link DASHBOARD_TREND_WINDOW_MONTHS}
   * window as the trends — from the first day of the oldest month through today
   * (never a future day), chronological. Holidays and record-less days carry a
   * `null` rate.
   */
  readonly attendanceHeatmap: readonly AttendanceHeatmapCell[];
};
