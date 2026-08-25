import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { SetupCodeEntryForm } from './setup-code-entry-form';
import { SetupCodeRedeemForm } from './setup-code-redeem-form';
import { SetupCodeRecoveryForm } from './setup-code-recovery-form';

type Step =
  | { readonly name: 'code' }
  | { readonly name: 'onboarding'; readonly setupCode: string }
  | { readonly name: 'recovery'; readonly setupCode: string };

/**
 * The code-first setup-code flow (SOU-303), swapped into the login card the same
 * way the forgot-password flow is. Step 1 proves the code; from there the flow
 * branches — a first onboarding collects the staff's own identity + password, a
 * director-reissued recovery collects a new password only. On success they land
 * back on the standard login screen with a confirmation toast and sign in normally;
 * the app never auto-authenticates them off the redeem step.
 */
export function SetupCodeRedeemFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ name: 'code' });

  const handleSuccess = () => {
    toast.success(t('auth.setup.success'));
    onClose();
  };

  const back = step.name === 'code' ? onClose : () => setStep({ name: 'code' });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={back}
          aria-label={t('auth.setup.back')}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold text-primary">{t('auth.setup.title')}</h1>
      </header>

      <p className="text-sm text-muted-foreground">{t('auth.setup.subtitle')}</p>

      {step.name === 'code' ? (
        <SetupCodeEntryForm
          onValidated={({ setupCode, needsIdentity }) =>
            setStep(
              needsIdentity
                ? { name: 'onboarding', setupCode }
                : { name: 'recovery', setupCode },
            )
          }
        />
      ) : step.name === 'onboarding' ? (
        <SetupCodeRedeemForm setupCode={step.setupCode} onSuccess={handleSuccess} />
      ) : (
        <SetupCodeRecoveryForm setupCode={step.setupCode} onSuccess={handleSuccess} />
      )}
    </div>
  );
}
