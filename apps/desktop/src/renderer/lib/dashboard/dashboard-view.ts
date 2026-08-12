import type { DashboardAdvancedSummaryDto, DashboardBasicSummaryDto } from '../../../shared/ipc/contract';

/** The Basique dashboard's four cards — a direct alias of the boundary's schema. */
export type DashboardBasicSummaryView = DashboardBasicSummaryDto;

/** The Avancé dashboard's four widgets — a direct alias of the boundary's schema. */
export type DashboardAdvancedSummaryView = DashboardAdvancedSummaryDto;

export type MonthlyRevenuePointView = DashboardAdvancedSummaryView['revenueTrend'][number];
export type MonthlyEnrollmentPointView = DashboardAdvancedSummaryView['enrollmentEvolution'][number];
export type SubjectRevenueShareView = DashboardAdvancedSummaryView['subjectRevenueBreakdown'][number];
export type MonthlyEnrollmentActivityPointView = DashboardAdvancedSummaryView['enrollmentActivity'][number];
export type AttendanceHeatmapCellView = DashboardAdvancedSummaryView['attendanceHeatmap'][number];
