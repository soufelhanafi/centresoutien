import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { SetupCodeRedeemForm } from './setup-code-redeem-form';

/**
 * The first-login setup-code flow (SOU-256), swapped into the login card the same
 * way the forgot-password flow is. An invited employee redeems their one-time
 * code and sets their own password here; on success they land back on the
 * standard login screen with a confirmation toast and sign in normally — the app
 * never auto-authenticates them off the redeem step.
 */
export function SetupCodeRedeemFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  const handleSuccess = () => {
    toast.success(t('auth.setup.success'));
    onClose();
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label={t('auth.setup.back')}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold text-primary">{t('auth.setup.title')}</h1>
      </header>

      <p className="text-sm text-muted-foreground">{t('auth.setup.subtitle')}</p>

      <SetupCodeRedeemForm onSuccess={handleSuccess} />
    </div>
  );
}
