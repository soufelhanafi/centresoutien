import { useTranslation } from 'react-i18next';
import { WEEKDAYS } from '@centresoutien/domain';
import { Clock } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, ErrorState, Skeleton } from '@centresoutien/ui';
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
      <Card className="w-full max-w-2xl" aria-busy="true">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {WEEKDAYS.map((day) => (
            <Skeleton key={day} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        className="w-full max-w-2xl"
        icon={<Clock className="h-5 w-5" aria-hidden="true" />}
        title={t('centerHours.loadError')}
        description={t('centerHours.loadErrorBody')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('centerHours.retry')}
          </Button>
        }
      />
    );
  }

  return <CenterHoursForm initialWeek={seedWeek(query.data.week)} />;
}
