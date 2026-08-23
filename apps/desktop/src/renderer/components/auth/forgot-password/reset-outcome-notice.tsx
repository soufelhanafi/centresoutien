import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@centresoutien/ui';

/**
 * The terminal state of a password reset (SOU-156 recovery path, SOU-273 email
 * path): the password was changed and the admin must sign in afresh. The only
 * action is returning to the login screen — a fresh sign-in, never a silent
 * re-entry into the app. The copy varies by which method succeeded.
 */
export function ResetOutcomeNotice({
  onBackToLogin,
  variant = 'recovery',
}: {
  onBackToLogin: () => void;
  variant?: 'recovery' | 'email';
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {t(`auth.forgot.success.${variant}.title`)}
          </h2>
          <p className="text-sm text-muted-foreground">{t(`auth.forgot.success.${variant}.body`)}</p>
        </div>
      </div>
      <Button type="button" className="w-full" onClick={onBackToLogin}>
        {t('auth.forgot.backToLogin')}
      </Button>
    </div>
  );
}
