import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import { useDashboardBasicSummary } from '../../hooks/dashboard/use-dashboard-basic-summary';
import { KpiCard } from './kpi-card';
import { DashboardQuickActions } from './dashboard-quick-actions';

/** The Basique dashboard pane (SOU-100): three KPI cards + quick actions, gated by `dashboard.basic` (every plan). */
export function DashboardBasicPanel() {
  const { t } = useTranslation();
  const query = useDashboardBasicSummary();

  if (query.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="h-5 w-5" aria-hidden="true" />}
        title={t('dashboard.basic.loadError.title')}
        description={t('dashboard.basic.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('dashboard.basic.loadError.retry')}
          </Button>
        }
      />
    );
  }

  const summary = query.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <KpiCard label={t('dashboard.basic.kpis.todaysSessions')} value={summary.todaysSessionCount} />
        <KpiCard label={t('dashboard.basic.kpis.activeStudents')} value={summary.activeStudentCount} />
        <KpiCard
          label={t('dashboard.basic.kpis.unpaidInvoices')}
          value={summary.unpaidInvoiceCount}
          tone={summary.unpaidInvoiceCount > 0 ? 'warning' : 'default'}
        />
      </div>
      <DashboardQuickActions />
    </div>
  );
}
