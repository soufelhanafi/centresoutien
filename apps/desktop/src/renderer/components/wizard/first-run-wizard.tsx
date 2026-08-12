import { useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@centresoutien/ui';
import { currentStep, type WizardStepId } from '@centresoutien/domain';
import { useWizardStore } from '../../stores/wizard-store';
import { WizardProgress } from './wizard-progress';
import { WizardShell } from './wizard-shell';
import { WizardDone } from './wizard-done';
import { LanguageStep } from './steps/language-step';
import { AdminAccountStep } from './steps/admin-account-step';
import { CenterProfileStep } from './steps/center-profile-step';

/** One component per step. Adding a step is a domain change plus one entry here. */
const STEP_COMPONENTS: Record<WizardStepId, ComponentType> = {
  language: LanguageStep,
  'center-profile': CenterProfileStep,
  'admin-account': AdminAccountStep,
};

/**
 * Walks the first-run steps sequenced by the domain machine. Default center
 * hours are seeded at center creation, so the run ends right after the admin
 * account — hours and holidays are configured later in Settings.
 */
export function FirstRunWizard({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const init = useWizardStore((store) => store.init);
  const state = useWizardStore((store) => store.state);

  useEffect(() => {
    init();
  }, [init]);

  if (!state) return null;

  const step = state.status === 'completed' ? null : currentStep(state);
  const StepComponent = step ? STEP_COMPONENTS[step] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col gap-8 p-8">
          <header className="flex flex-col gap-1 text-center">
            <h1 className="text-2xl font-semibold text-primary">{t('wizard.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('wizard.subtitle')}</p>
          </header>

          {StepComponent && step ? (
            <>
              <WizardProgress state={state} />
              <WizardShell step={step}>
                <StepComponent />
              </WizardShell>
            </>
          ) : (
            <WizardDone onEnter={onComplete} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
