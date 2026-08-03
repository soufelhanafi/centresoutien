import type { SubjectId } from '../entities/subject';

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
};
