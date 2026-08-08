import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent } from '@centresoutien/ui';
import { LanguageToggle } from '../language-toggle';
import { LicenseStatusSummary } from './license-status-summary';
import { LicenseActivationForm } from './license-activation-form';
import { DemoRestarting } from '../demo/demo-restarting';
import { useCreateDemo } from '../../hooks/demo/use-create-demo';
import type { LicenseStatusView } from '../../lib/license/license-contract';

/**
 * Full-screen activation page (SOU-104), the only screen {@link LicenseGate}
 * renders until a valid license activates. Mirrors the login screen's centered
 * card so onboarding feels like one product. There is no skip: a successful
 * activation invalidates the license-status query, flipping the gate to the app.
 *
 * The "Explorer la démo" entry (SOU-110, review M2) gives a salesperson a path
 * on a fresh, unlicensed laptop: `demo.create` is reachable under restricted
 * mode (it only ever touches demo artefacts), so a demo can be shown without any
 * activation. On success the card swaps to the restarting state.
 */
export function LicenseActivationScreen({ status }: { status: LicenseStatusView }) {
  const { t } = useTranslation();
  const createDemo = useCreateDemo();

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

          {createDemo.isSuccess ? (
            <DemoRestarting />
          ) : (
            <>
              <header className="flex flex-col gap-1 text-center">
                <h1 className="text-2xl font-semibold text-primary">{t('license.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('license.subtitle')}</p>
              </header>

              <LicenseStatusSummary status={status} />
              <LicenseActivationForm />

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
                {createDemo.isError && (
                  <p role="alert" className="text-center text-sm text-destructive">
                    {t('demo.createError')}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
