import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { Button, Input, Label } from '@centresoutien/ui';
import type { JoinTarget } from '../../../lib/hub/join-target';
import { JoinStepHeader } from './join-step-header';

/**
 * Step 2 of the join branch (SOU-318): the director reads the pairing code shown
 * on the hosting laptop's Settings card and types it here. The code is a shared
 * secret, not validated locally — a wrong one surfaces as a join failure on the
 * next step.
 */
export function JoinCodeStep({
  target,
  onBack,
  onConfirm,
}: {
  target: JoinTarget;
  onBack: () => void;
  onConfirm: (token: string) => void;
}) {
  const { t } = useTranslation();
  const [token, setToken] = useState('');

  const trimmed = token.trim();
  const canConfirm = trimmed !== '';

  return (
    <div className="flex flex-col gap-6">
      <JoinStepHeader
        icon={<KeyRound className="h-5 w-5" aria-hidden />}
        title={t('hub.join.code.title')}
        description={t('hub.join.code.description', { name: target.label })}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="join-token">{t('hub.join.code.label')}</Label>
        <Input
          id="join-token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t('hub.join.code.placeholder')}
          className="font-mono tracking-widest"
          dir="ltr"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t('hub.join.code.hint')}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('wizard.back')}
        </Button>
        <Button type="button" onClick={() => onConfirm(trimmed)} disabled={!canConfirm}>
          {t('hub.join.code.confirm')}
        </Button>
      </div>
    </div>
  );
}
