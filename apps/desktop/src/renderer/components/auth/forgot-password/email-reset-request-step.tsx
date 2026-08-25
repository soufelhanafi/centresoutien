import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Label } from '@centresoutien/ui';
import { useRequestEmailReset } from '../../../hooks/auth/use-request-email-reset';

type FailedOutcome = 'account-not-found' | 'no-email' | 'unreachable' | 'rate-limited';

/**
 * Step 1 of the email reset (SOU-273, per-user in SOU-303): the locked-out staff
 * enter their username, and the relay mails a 6-digit code to that account's stored
 * address in the CURRENT UI locale. `sent` advances to the confirm step, carrying
 * the username forward. The failure outcomes render inline — `account-not-found`
 * (wrong username → retry), `no-email` (no address on file → ask the director for a
 * fresh code), plus the offline / throttle cases.
 */
export function EmailResetRequestStep({
  onSent,
  onBackToChooser,
}: {
  onSent: (username: string) => void;
  onBackToChooser: () => void;
}) {
  const { t, i18n } = useTranslation();
  const request = useRequestEmailReset();
  const [username, setUsername] = useState('');
  const [failure, setFailure] = useState<FailedOutcome | null>(null);
  const locale = i18n.language === 'ar' ? 'ar' : 'fr';
  const trimmed = username.trim();

  const onSend = async () => {
    setFailure(null);
    const result = await request.mutateAsync({ username: trimmed, locale });
    if (result.outcome === 'sent') {
      onSent(trimmed);
      return;
    }
    setFailure(result.outcome);
  };

  const suggestsRecovery = failure === 'no-email' || failure === 'unreachable';

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSend();
      }}
    >
      <p className="text-sm text-muted-foreground">{t('auth.forgot.email.explainer')}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email-reset-username">{t('auth.forgot.email.usernameLabel')}</Label>
        <Input
          id="email-reset-username"
          autoFocus
          autoComplete="username"
          placeholder={t('auth.forgot.email.usernamePlaceholder')}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={request.isPending || trimmed === ''}>
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
    </form>
  );
}

function failureKey(
  outcome: FailedOutcome,
): 'accountNotFound' | 'noEmail' | 'unreachable' | 'rateLimited' {
  if (outcome === 'account-not-found') return 'accountNotFound';
  if (outcome === 'no-email') return 'noEmail';
  if (outcome === 'unreachable') return 'unreachable';
  return 'rateLimited';
}
