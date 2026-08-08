import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@centresoutien/ui';
import { useDashboardBasicSummary } from '../../hooks/dashboard/use-dashboard-basic-summary';
import { ArgentSection } from './argent-section';
import { EffectifsSection } from './effectifs-section';
import { TeacherLoadSection } from './teacher-load-section';
import { SeancesSection } from './seances-section';

/** The Basique dashboard pane (SOU-177): the four blocks from design 1b. */
export function DashboardBasicPanel() {
  const { t } = useTranslation();
  const query = useDashboardBasicSummary();

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <Skeleton className="h-6 w-48 rounded" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <Skeleton key={card} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
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
      <ArgentSection argent={summary.argent} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <EffectifsSection effectifs={summary.effectifs} />
        <TeacherLoadSection teachers={summary.teacherWeeklyLoad} />
        <SeancesSection seances={summary.seances} />
      </div>
    </div>
  );
}
