import { useTranslation } from 'react-i18next';
import { WizardFooter } from '../wizard-footer';
import { useWizardNav } from '../../../hooks/wizard/use-wizard-nav';

/**
 * Placeholder body for steps whose real configuration lands in a later ticket
 * (Hours → SOU-29, Holidays → SOU-30). Center Profile is now a real step
 * (see `center-profile-step.tsx`, SOU-111). The wizard's ordering and
 * non-skippable guarantee are already real here; only the per-step form is
 * deferred. `optional` steps additionally show a Skip button — legal only
 * because the domain marks them optional (Holidays finishing empty is valid).
 */
function StepStub({ optional = false }: { optional?: boolean }) {
  const { t } = useTranslation();
  const { back, submit, skip, canGoBack } = useWizardNav();

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {t('wizard.stub.note')}
      </p>
      <WizardFooter
        onBack={back}
        canGoBack={canGoBack}
        onNext={submit}
        nextLabel={t('wizard.next')}
        {...(optional ? { onSkip: skip } : {})}
      />
    </div>
  );
}

export function HoursStep() {
  return <StepStub />;
}

export function HolidaysStep() {
  return <StepStub optional />;
}
