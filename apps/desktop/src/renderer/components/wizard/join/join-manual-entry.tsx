import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Label } from '@centresoutien/ui';
import { targetFromManual, type JoinTarget } from '../../../lib/hub/join-target';

const DEFAULT_PORT = '8787';

/**
 * Fallback for when LAN discovery finds nothing (SOU-318): the director types the
 * host laptop's IP, port, and center code straight from the hosting card on the
 * other machine. Produces the same normalized `JoinTarget` a discovered center
 * does, so the pairing-code step is identical afterwards.
 */
export function JoinManualEntry({ onSubmit }: { onSubmit: (target: JoinTarget) => void }) {
  const { t } = useTranslation();
  const [host, setHost] = useState('');
  const [port, setPort] = useState(DEFAULT_PORT);
  const [centerCode, setCenterCode] = useState('');

  const parsedPort = Number.parseInt(port, 10);
  const canSubmit = host.trim() !== '' && centerCode.trim() !== '' && Number.isInteger(parsedPort) && parsedPort > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(targetFromManual({ host: host.trim(), port: parsedPort, centerCode: centerCode.trim() }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">{t('hub.join.manual.title')}</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="join-host">{t('hub.join.manual.host')}</Label>
          <Input
            id="join-host"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder={t('hub.join.manual.hostPlaceholder')}
            inputMode="decimal"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="join-port">{t('hub.join.manual.port')}</Label>
          <Input
            id="join-port"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            inputMode="numeric"
            dir="ltr"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="join-center-code">{t('hub.join.manual.centerCode')}</Label>
        <Input
          id="join-center-code"
          value={centerCode}
          onChange={(event) => setCenterCode(event.target.value)}
          placeholder={t('hub.join.manual.centerCodePlaceholder')}
          dir="ltr"
        />
      </div>
      <Button type="button" variant="outline" onClick={submit} disabled={!canSubmit} className="self-start">
        {t('hub.join.manual.continue')}
      </Button>
    </div>
  );
}
