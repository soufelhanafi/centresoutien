import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import { useFeature } from '../../hooks/use-feature';
import { useDashboardAdvancedSummary } from '../../hooks/dashboard/use-dashboard-advanced-summary';
import { RevenueTrendChart } from './revenue-trend-chart';
import { EnrollmentEvolutionChart } from './enrollment-evolution-chart';
import { AttendanceRateCard } from './attendance-rate-card';
import { SubjectRevenueBreakdown } from './subject-revenue-breakdown';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';
const WIDGET_CARD = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';

/** The Avancé dashboard pane (SOU-100), rendered only when `dashboard.advanced` (Premium) is unlocked. */
export function DashboardAdvancedPanel() {
  const { t } = useTranslation();
  const canViewAdvanced = useFeature('dashboard.advanced');
  const query = useDashboardAdvancedSummary(canViewAdvanced);

  if (query.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((widget) => (
          <Skeleton key={widget} className="h-52 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
        title={t('dashboard.advanced.loadError.title')}
        description={t('dashboard.advanced.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('dashboard.advanced.loadError.retry')}
          </Button>
        }
      />
    );
  }

  const summary = query.data;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      <div className={WIDGET_CARD}>
        <p className={SECTION_LABEL}>{t('dashboard.advanced.widgets.revenueTrend')}</p>
        <RevenueTrendChart points={summary.revenueTrend} />
      </div>
      <div className={WIDGET_CARD}>
        <p className={SECTION_LABEL}>{t('dashboard.advanced.widgets.enrollmentEvolution')}</p>
        <EnrollmentEvolutionChart points={summary.enrollmentEvolution} />
      </div>
      <div className={WIDGET_CARD}>
        <p className={SECTION_LABEL}>{t('dashboard.advanced.widgets.attendanceRate')}</p>
        <AttendanceRateCard percent={summary.attendanceRatePercent} />
      </div>
      <div className={WIDGET_CARD}>
        <p className={SECTION_LABEL}>{t('dashboard.advanced.widgets.subjectBreakdown')}</p>
        <SubjectRevenueBreakdown shares={summary.subjectRevenueBreakdown} />
      </div>
    </div>
  );
}
