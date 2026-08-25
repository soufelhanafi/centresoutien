import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Wifi } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { useDisableHosting } from '../../../hooks/hub/use-disable-hosting';
import { hubKeys } from '../../../hooks/hub/keys';
import { HubRestartConfirmDialog } from './hub-restart-confirm-dialog';

/**
 * Shown when this device currently hosts the center's hub (SOU-318): the pairing
 * token read out to joining laptops, the LAN address, and the stop action. The
 * token is rendered in monospace so it is easy to dictate; stopping restarts the
 * app, so it is confirmed first.
 */
export function HubHostingActive({
  address,
  port,
  token,
}: {
  address: string;
  port: number;
  token: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const disable = useDisableHosting();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(t('hub.hosting.tokenCopied'));
    } catch {
      toast.error(t('hub.hosting.tokenCopyError'));
    }
  };

  const onConfirm = async () => {
    await disable.mutateAsync();
    void queryClient.invalidateQueries({ queryKey: hubKeys.hostingStatus });
    setConfirmOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('hub.hosting.activeBody')}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('hub.hosting.tokenLabel')}</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-lg font-mono tracking-widest text-foreground" dir="ltr">
            {token}
          </code>
          <Button type="button" variant="outline" size="icon" onClick={copyToken} aria-label={t('hub.hosting.copyToken')}>
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wifi className="h-4 w-4" aria-hidden="true" />
        <span>{t('hub.hosting.addressLabel')}</span>
        <span className="font-mono text-foreground" dir="ltr">
          {address}:{port}
        </span>
      </div>

      <Button type="button" variant="destructive" className="self-start" onClick={() => setConfirmOpen(true)}>
        {t('hub.hosting.disable')}
      </Button>

      <HubRestartConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('hub.hosting.disableConfirmTitle')}
        description={t('hub.hosting.restartNotice')}
        confirmLabel={t('hub.hosting.disableConfirm')}
        pending={disable.isPending}
        onConfirm={onConfirm}
        destructive
      />
    </div>
  );
}
