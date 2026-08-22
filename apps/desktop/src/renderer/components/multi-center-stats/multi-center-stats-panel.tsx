import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useMultiCenterStats } from '../../hooks/multi-center-stats/use-multi-center-stats';
import { MultiCenterStatsContent } from './multi-center-stats-content';

/** The live per-center stats panel (Premium): fetches the view and covers loading/error/empty/ready. */
export function MultiCenterStatsPanel({ locale }: { locale: string }) {
  const { t } = useTranslation();
  const query = useMultiCenterStats(true);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <Skeleton key={card} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        title={t('multiCenterStats.loadError.title')}
        description={t('multiCenterStats.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('multiCenterStats.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (query.data.rows.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        title={t('multiCenterStats.empty.title')}
        description={t('multiCenterStats.empty.body')}
      />
    );
  }

  return <MultiCenterStatsContent view={query.data} locale={locale} />;
}
