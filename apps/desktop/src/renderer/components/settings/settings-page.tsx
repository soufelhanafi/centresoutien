import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, ErrorState, Skeleton } from '@centresoutien/ui';
import { useCenterProfile } from '../../hooks/center/use-center-profile';
import { CenterProfileForm } from './center-profile-form';

/**
 * Center-profile section of the Settings page (SOU-28). Owns the load lifecycle
 * — skeleton while fetching, a retryable card on failure — then renders the form
 * seeded with the canonical row (or blank before the first save). Mounts inside
 * the routed Settings page alongside the other settings sections.
 */
export function CenterProfileSettings() {
  const { t } = useTranslation();
  const query = useCenterProfile();

  return (
    <section className="flex w-full flex-col gap-4">
      {query.isPending && (
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-40" />
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <ErrorState
          className="w-full max-w-2xl"
          icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
          title={t('settings.center.loadErrorTitle')}
          description={t('settings.center.loadErrorBody')}
          action={
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('settings.center.retry')}
            </Button>
          }
        />
      )}

      {query.isSuccess && <CenterProfileForm center={query.data.center} />}
    </section>
  );
}
