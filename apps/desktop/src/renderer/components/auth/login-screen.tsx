import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LoginForm } from './login-form';
import { ForgotPasswordFlow } from './forgot-password/forgot-password-flow';
import { DemoRestarting } from '../demo/demo-restarting';
import { useCreateDemo } from '../../hooks/demo/use-create-demo';

/**
 * The full-screen login page (SOU-27), shown by {@link AuthGate} when the device
 * is not remembered. Mirrors the first-run wizard's centered card so auth and
 * onboarding feel like one product. The language toggle stays reachable here — the
 * admin may want to switch before their first sign-in. The "forgot password" flow
 * (SOU-156) swaps into the same card so recovery feels part of one product. The
 * "Explorer la démo" entry (SOU-110) sits under the form and relaunches the app
 * into a seeded demo center; on success the card shows the restarting state.
 */
export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { t } = useTranslation();
  const createDemo = useCreateDemo();
  const [view, setView] = useState<'login' | 'forgot'>('login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-8 p-8">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('app.title')}
            </span>
            <LanguageToggle />
          </div>

          {createDemo.isSuccess ? (
            <DemoRestarting />
          ) : view === 'login' ? (
            <>
              <header className="flex flex-col gap-1 text-center">
                <h1 className="text-2xl font-semibold text-primary">{t('auth.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('auth.subtitle')}</p>
              </header>
              <LoginForm
                onAuthenticated={onAuthenticated}
                onForgotPassword={() => setView('forgot')}
              />
              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <p className="text-center text-xs text-muted-foreground">
                  {t('auth.login.exploreDemoHint')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={createDemo.isPending}
                  onClick={() => createDemo.mutate()}
                >
                  {createDemo.isPending ? t('demo.intro.creating') : t('auth.login.exploreDemo')}
                </Button>
              </div>
            </>
          ) : (
            <ForgotPasswordFlow onClose={() => setView('login')} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
