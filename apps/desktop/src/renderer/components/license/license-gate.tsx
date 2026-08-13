import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useLicenseStatus } from '../../hooks/license/use-license-status';
import { LicenseActivationScreen } from './license-activation-screen';

/**
 * Hard license lock (SOU-104): the app is unreachable until a valid license is
 * active. An active trial is also usable; every restricted state — including an
 * expired trial — renders ONLY the activation screen, never the children and
 * never a skip-into-app path. A successful activation flips the status to
 * `active` and the gate opens on its own.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useLicenseStatus();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t('license.gate.loading')} />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">{t('license.gate.errorTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('license.gate.errorBody')}</p>
        </div>
        <Button type="button" onClick={() => void refetch()}>
          {t('license.gate.retry')}
        </Button>
      </main>
    );
  }

  if (data.status !== 'active' && data.status !== 'trial-active') {
    return <LicenseActivationScreen status={data} />;
  }

  return <>{children}</>;
}
