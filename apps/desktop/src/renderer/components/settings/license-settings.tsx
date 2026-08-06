import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@centresoutien/ui';
import { useLicenseStatus } from '../../hooks/license/use-license-status';
import { LicenseStatusSummary } from '../license/license-status-summary';
import { LicenseActivationForm } from '../license/license-activation-form';

/**
 * Licence tab of the Settings page (SOU-104): the current license state plus the
 * re-activation form used after a plan upgrade (Essentiel → Pro → Premium). The
 * same `license.activate` call overwrites the stored license, so re-activation is
 * just another submission of this form.
 */
export function LicenseSettings() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useLicenseStatus();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.license.title')}</CardTitle>
        <CardDescription>{t('settings.license.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isPending && (
          <div className="flex items-center gap-3 py-4" aria-busy="true">
            <Loader2 className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('license.gate.loading')}</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t('license.gate.errorBody')}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              {t('license.gate.retry')}
            </Button>
          </div>
        )}

        {data && (
          <>
            <LicenseStatusSummary status={data} />
            <LicenseActivationForm />
          </>
        )}
      </CardContent>
    </Card>
  );
}
