import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LicenseStatusSummary } from './license-status-summary';
import { LicenseActivationForm } from './license-activation-form';
import type { LicenseStatusView } from '../../lib/license/license-contract';

/**
 * Full-screen activation page (SOU-104), shown by {@link LicenseGate} at first
 * run after the wizard. Mirrors the login screen's centered card so onboarding
 * feels like one product. Activation is optional: the user may continue in the
 * clearly-labeled restricted mode (Essentiel fallback) and activate later from
 * Settings. `onDone` advances the gate on either a successful activation or skip.
 */
export function LicenseActivationScreen({
  status,
  onDone,
}: {
  status: LicenseStatusView;
  onDone: () => void;
}) {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col gap-8 p-8">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('app.title')}
            </span>
            <LanguageToggle />
          </div>

          <header className="flex flex-col gap-1 text-center">
            <h1 className="text-2xl font-semibold text-primary">{t('license.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('license.subtitle')}</p>
          </header>

          <LicenseStatusSummary status={status} />
          <LicenseActivationForm onActivated={onDone} />

          <Button type="button" variant="ghost" onClick={onDone} className="self-center">
            {t('license.gate.skip')}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
