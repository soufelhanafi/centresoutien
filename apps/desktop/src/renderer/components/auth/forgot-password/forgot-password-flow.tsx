import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { RecoveryCodeResetForm } from './recovery-code-reset-form';
import { EmailResetForm } from './email-reset-form';
import { ResetOutcomeNotice } from './reset-outcome-notice';

type ResetMethod = 'recovery' | 'email';

/**
 * The "forgot password" flow (SOU-156, SOU-273). Now that the email path ships
 * alongside the offline recovery code, the entry point is a method chooser; the
 * shell (header + back) stays generic. Picking a method swaps in its form; the
 * back arrow returns to the chooser mid-flow and closes the flow at the chooser.
 * A successful reset lands on a fresh-login notice keyed to the method used.
 */
export function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<ResetMethod | null>(null);
  const [resetVia, setResetVia] = useState<ResetMethod | null>(null);

  if (resetVia) {
    return <ResetOutcomeNotice onBackToLogin={onClose} variant={resetVia} />;
  }

  const goBack = () => (method === null ? onClose() : setMethod(null));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={goBack} aria-label={t('auth.forgot.back')}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold text-primary">{t('auth.forgot.title')}</h1>
      </header>

      {method === null ? (
        <MethodChooser onPick={setMethod} />
      ) : method === 'recovery' ? (
        <RecoveryCodeResetForm onSuccess={() => setResetVia('recovery')} />
      ) : (
        <EmailResetForm onSuccess={() => setResetVia('email')} onBackToChooser={() => setMethod(null)} />
      )}
    </div>
  );
}

function MethodChooser({ onPick }: { onPick: (method: ResetMethod) => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('auth.forgot.method.title')}</p>
      <div className="flex flex-col gap-3">
        <MethodButton
          icon={<KeyRound className="h-5 w-5" aria-hidden />}
          title={t('auth.forgot.method.recovery.title')}
          description={t('auth.forgot.method.recovery.description')}
          onClick={() => onPick('recovery')}
        />
        <MethodButton
          icon={<Mail className="h-5 w-5" aria-hidden />}
          title={t('auth.forgot.method.email.title')}
          description={t('auth.forgot.method.email.description')}
          onClick={() => onPick('email')}
        />
      </div>
    </div>
  );
}

function MethodButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="flex h-auto w-full items-start justify-start gap-3 whitespace-normal p-4 text-start"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-sm font-normal text-muted-foreground">{description}</span>
      </span>
    </Button>
  );
}
