import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@centresoutien/ui';
import { useRequestEmailReset } from '../../../hooks/auth/use-request-email-reset';

type FailedOutcome = 'no-email' | 'unreachable' | 'rate-limited';

/**
 * Step 1 of the email reset (SOU-273): asks the relay to mail a 6-digit code to
 * the owner's stored address in the CURRENT UI locale. `sent` advances to the
 * confirm step; the three failure outcomes render inline, with the offline / no
 * address on file cases pointing back to the recovery-code path.
 */
export function EmailResetRequestStep({
  onSent,
  onBackToChooser,
}: {
  onSent: () => void;
  onBackToChooser: () => void;
}) {
  const { t, i18n } = useTranslation();
  const request = useRequestEmailReset();
  const [failure, setFailure] = useState<FailedOutcome | null>(null);
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';

  const onSend = async () => {
    setFailure(null);
    const result = await request.mutateAsync({ locale });
    if (result.outcome === 'sent') {
      onSent();
      return;
    }
    setFailure(result.outcome);
  };

  const suggestsRecovery = failure === 'no-email' || failure === 'unreachable';

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t('auth.forgot.email.explainer')}</p>

      <Button type="button" onClick={() => void onSend()} disabled={request.isPending}>
        {request.isPending ? t('auth.forgot.email.sending') : t('auth.forgot.email.sendCode')}
      </Button>

      {failure ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-sm text-destructive">
            {t(`auth.forgot.email.${failureKey(failure)}`)}
          </p>
          {suggestsRecovery ? (
            <Button type="button" variant="outline" onClick={onBackToChooser}>
              {t('auth.forgot.email.useRecovery')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {request.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('auth.forgot.error')}
        </p>
      ) : null}
    </div>
  );
}

function failureKey(outcome: FailedOutcome): 'noEmail' | 'unreachable' | 'rateLimited' {
  if (outcome === 'no-email') return 'noEmail';
  if (outcome === 'unreachable') return 'unreachable';
  return 'rateLimited';
}
