import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useLicenseStatus } from '../../hooks/license/use-license-status';
import { LicenseActivationScreen } from './license-activation-screen';

/**
 * Shows the activation screen at first run after the wizard (SOU-104), then hands
 * off to the app. It intercepts only the `missing` state — a device that has
 * never been activated — and lets the user activate or continue in restricted
 * mode. Any installed license (active, or a restricted invalid/expired one) flows
 * straight through; those are managed from the Settings tab, never blocking use.
 * A successful activation flips the status to `active` and the gate opens on its
 * own; skipping dismisses the screen for the session.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useLicenseStatus();
  const [dismissed, setDismissed] = useState(false);

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

  if (data.status === 'missing' && !dismissed) {
    return <LicenseActivationScreen status={data} onDone={() => setDismissed(true)} />;
  }

  return <>{children}</>;
}
