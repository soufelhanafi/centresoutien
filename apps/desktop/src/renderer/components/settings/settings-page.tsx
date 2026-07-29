import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@centresoutien/ui';
import { useCenterProfile } from '../../hooks/center/use-center-profile';
import { CenterProfileForm } from './center-profile-form';

/**
 * Settings screen for the center profile (SOU-28). Owns the load lifecycle —
 * skeleton while fetching, a retryable card on failure — then renders the form
 * seeded with the canonical row (or blank before the first save).
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const query = useCenterProfile();

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>

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
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{t('settings.center.loadErrorTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">{t('settings.center.loadErrorBody')}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              {t('settings.center.retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.isSuccess && <CenterProfileForm center={query.data.center} />}
    </section>
  );
}
