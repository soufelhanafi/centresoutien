import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LoginForm } from './login-form';

/**
 * The full-screen login page (SOU-27), shown by {@link AuthGate} when the device
 * is not remembered. Mirrors the first-run wizard's centered card so auth and
 * onboarding feel like one product. The language toggle stays reachable here — the
 * admin may want to switch before their first sign-in.
 */
export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { t } = useTranslation();

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

          <header className="flex flex-col gap-1 text-center">
            <h1 className="text-2xl font-semibold text-primary">{t('auth.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('auth.subtitle')}</p>
          </header>

          <LoginForm onAuthenticated={onAuthenticated} />
        </CardContent>
      </Card>
    </main>
  );
}
