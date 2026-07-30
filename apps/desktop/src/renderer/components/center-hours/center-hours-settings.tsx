import { useTranslation } from 'react-i18next';
import { WEEKDAYS } from '@centresoutien/domain';
import { Button, Skeleton } from '@centresoutien/ui';
import { useCenterHours } from '../../hooks/center-hours/use-center-hours';
import { seedWeek } from '../../lib/center-hours';
import { CenterHoursForm } from './center-hours-form';

/**
 * Container for the center-hours editor: resolves the persisted week and renders
 * the loading, error, and ready states. A fresh center (no saved rows) is not an
 * empty state — the form seeds the default week, so the user always sees an
 * editable grid.
 */
export function CenterHoursSettings() {
  const { t } = useTranslation();
  const query = useCenterHours();

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex w-full max-w-2xl flex-col gap-4">
        <Skeleton className="h-5 w-48" />
        {WEEKDAYS.map((day) => (
          <Skeleton key={day} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">{t('centerHours.loadError')}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t('centerHours.retry')}
        </Button>
      </div>
    );
  }

  return <CenterHoursForm initialWeek={seedWeek(query.data.week)} />;
}
