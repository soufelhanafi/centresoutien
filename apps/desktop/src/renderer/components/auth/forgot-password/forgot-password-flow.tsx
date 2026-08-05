import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@centresoutien/ui';
import { RecoveryCodeResetForm } from './recovery-code-reset-form';
import { ResetOutcomeNotice } from './reset-outcome-notice';

/**
 * The "forgot password" flow (SOU-156). For the MVP it exposes a single reset
 * path — the offline recovery code — so there is no method chooser; the entry
 * point renders the recovery form directly (KISS). The shell (header + back)
 * stays generic so a follow-up can re-introduce a chooser once the email and
 * security-question paths ship. A successful reset lands on a fresh-login notice.
 */
export function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [isReset, setIsReset] = useState(false);

  if (isReset) {
    return <ResetOutcomeNotice onBackToLogin={onClose} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('auth.forgot.back')}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold text-primary">{t('auth.forgot.title')}</h1>
      </header>

      <RecoveryCodeResetForm onSuccess={() => setIsReset(true)} />
    </div>
  );
}
