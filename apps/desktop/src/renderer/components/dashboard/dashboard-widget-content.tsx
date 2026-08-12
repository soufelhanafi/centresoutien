import type { ReactNode } from 'react';
import type { DashboardBasicSummaryView, DashboardAdvancedSummaryView } from '../../lib/dashboard/dashboard-view';
import type { AdvancedWidgetId, BasicWidgetId } from '../../lib/dashboard/widgets/registry';
import { ArgentSection } from './argent-section';
import { AttendanceHeatmap } from './attendance-heatmap';
import { AttendanceRateCard } from './attendance-rate-card';
import { DashboardQuickActions } from './dashboard-quick-actions';
import { EffectifsSection } from './effectifs-section';
import { EnrollmentActivityChart } from './enrollment-activity-chart';
import { EnrollmentEvolutionChart } from './enrollment-evolution-chart';
import { RevenueTrendChart } from './revenue-trend-chart';
import { SeancesSection } from './seances-section';
import { SubjectRevenueBreakdown } from './subject-revenue-breakdown';
import { TeacherLoadSection } from './teacher-load-section';

/**
 * The Basique widgets' renderers, keyed by widget id. A `Record` (not a switch)
 * makes a missing widget a compile error the day the registry grows.
 */
export const BASIC_WIDGET_CONTENT: Readonly<Record<BasicWidgetId, (summary: DashboardBasicSummaryView) => ReactNode>> = {
  argent: (summary) => <ArgentSection argent={summary.argent} />,
  effectifs: (summary) => <EffectifsSection effectifs={summary.effectifs} />,
  'teacher-load': (summary) => <TeacherLoadSection teachers={summary.teacherWeeklyLoad} />,
  seances: (summary) => <SeancesSection seances={summary.seances} />,
  'quick-actions': () => <DashboardQuickActions />,
};

/** The Avancé widgets' renderers, keyed by widget id. */
export const ADVANCED_WIDGET_CONTENT: Readonly<
  Record<AdvancedWidgetId, (summary: DashboardAdvancedSummaryView) => ReactNode>
> = {
  'revenue-trend': (summary) => <RevenueTrendChart points={summary.revenueTrend} />,
  'enrollment-evolution': (summary) => <EnrollmentEvolutionChart points={summary.enrollmentEvolution} />,
  'attendance-rate': (summary) => <AttendanceRateCard percent={summary.attendanceRatePercent} />,
  'subject-breakdown': (summary) => <SubjectRevenueBreakdown shares={summary.subjectRevenueBreakdown} />,
  'enrollment-activity': (summary) => <EnrollmentActivityChart points={summary.enrollmentActivity} />,
  'attendance-heatmap': (summary) => <AttendanceHeatmap cells={summary.attendanceHeatmap} />,
};
