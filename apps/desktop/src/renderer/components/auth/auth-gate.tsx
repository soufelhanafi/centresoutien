import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useSession, sessionQueryKey } from '../../hooks/auth/use-session';
import { LoginScreen } from './login-screen';

/**
 * Gates the app behind an authenticated session (SOU-27). Sits inside the
 * first-run gate — an admin account already exists by the time we get here — and
 * decides between the login screen and the app based on whether this device is
 * remembered. A successful login seeds the session cache so the app appears with
 * no extra round-trip.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useSession();

  if (isPending) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy="true"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t('auth.gate.loading')} />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">{t('auth.gate.errorTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.gate.errorBody')}</p>
        </div>
        <Button type="button" onClick={() => void refetch()}>
          {t('auth.gate.retry')}
        </Button>
      </main>
    );
  }

  if (data.authenticated) {
    return <>{children}</>;
  }

  return (
    <LoginScreen
      onAuthenticated={(session) =>
        queryClient.setQueryData(sessionQueryKey, {
          authenticated: true,
          role: session.role,
          permissions: session.permissions,
        })
      }
    />
  );
}
