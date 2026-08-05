import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { useOnlineStatus } from '../../../hooks/auth/use-online-status';
import { ResetMethodChooser, type ResetMethod } from './reset-method-chooser';
import { RecoveryCodeResetForm } from './recovery-code-reset-form';
import { SecurityQuestionsResetForm } from './security-questions-reset-form';
import { ResetOutcomeNotice } from './reset-outcome-notice';

type Step = 'choose' | 'recovery' | 'security' | 'done-recovery' | 'done-security';

/**
 * The "forgot password" flow (SOU-156): one entry point that chains the three
 * reset paths — recovery code (offline, primary), email (online-only placeholder
 * until SOU-157), and security questions (last resort) — and returns to a fresh
 * login on any successful reset. It owns only navigation between steps; each step
 * owns its own form, validation, and throttle handling.
 */
export function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>('choose');

  if (step === 'done-recovery') {
    return <ResetOutcomeNotice variant="recovery" onBackToLogin={onClose} />;
  }
  if (step === 'done-security') {
    return <ResetOutcomeNotice variant="confirmation" onBackToLogin={onClose} />;
  }

  const goBack = () => (step === 'choose' ? onClose() : setStep('choose'));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={goBack}
          aria-label={t('auth.forgot.back')}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold text-primary">{t('auth.forgot.title')}</h1>
      </header>

      {step === 'choose' ? (
        <ResetMethodChooser
          online={online}
          onSelect={(method: ResetMethod) => setStep(method)}
        />
      ) : null}

      {step === 'recovery' ? (
        <RecoveryCodeResetForm onSuccess={() => setStep('done-recovery')} />
      ) : null}

      {step === 'security' ? (
        <SecurityQuestionsResetForm onConfirmationRequired={() => setStep('done-security')} />
      ) : null}
    </div>
  );
}
