import { useTranslation } from 'react-i18next';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { Button } from '@centresoutien/ui';

/**
 * The terminal state of a reset attempt (SOU-156). `recovery` confirms the
 * password was changed and the admin must sign in afresh; `confirmation` tells
 * them a security-question reset was accepted and now waits on the email link
 * (SOU-157). Either way the only action is returning to the login screen — a
 * fresh sign-in, never a silent re-entry into the app.
 */
export function ResetOutcomeNotice({
  variant,
  onBackToLogin,
}: {
  variant: 'recovery' | 'confirmation';
  onBackToLogin: () => void;
}) {
  const { t } = useTranslation();
  const Icon = variant === 'recovery' ? CheckCircle2 : MailCheck;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <Icon className="h-10 w-10 text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {t(`auth.forgot.success.${variant}.title`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(`auth.forgot.success.${variant}.body`)}
          </p>
        </div>
      </div>
      <Button type="button" className="w-full" onClick={onBackToLogin}>
        {t('auth.forgot.backToLogin')}
      </Button>
    </div>
  );
}
