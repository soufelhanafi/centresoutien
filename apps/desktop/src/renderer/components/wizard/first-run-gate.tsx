import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useAdminExists, adminExistsQueryKey } from '../../hooks/wizard/use-admin-exists';
import { licenseStatusQueryKey } from '../../hooks/license/use-license-status';
import { FirstRunWizard } from './first-run-wizard';

/**
 * Chooses between the first-run wizard and the app: the wizard shows only when no
 * admin account exists yet (SOU-25). Once the wizard completes, it seeds the cache
 * with `exists: true` so the app appears without another round-trip — and without
 * flipping mid-wizard when the account is created a few steps early.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useAdminExists();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t('wizard.gate.loading')} />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">{t('wizard.gate.errorTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('wizard.gate.errorBody')}</p>
        </div>
        <Button type="button" onClick={() => void refetch()}>
          {t('wizard.gate.retry')}
        </Button>
      </main>
    );
  }

  if (data.exists) {
    return <>{children}</>;
  }

  return (
    <FirstRunWizard
      onComplete={() => {
        queryClient.setQueryData(adminExistsQueryKey, { exists: true });
        void queryClient.invalidateQueries({ queryKey: licenseStatusQueryKey });
      }}
    />
  );
}
