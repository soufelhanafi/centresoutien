import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { Button, toast } from '@centresoutien/ui';
import { useEnableHosting } from '../../../hooks/hub/use-enable-hosting';
import { hubKeys } from '../../../hooks/hub/keys';
import { hostingErrorCode } from '../../../lib/hub/hub-hosting-error';
import { HubRestartConfirmDialog } from './hub-restart-confirm-dialog';

/**
 * Shown when this device is not yet the center's hub (SOU-318): a one-line pitch
 * plus the enable action. Enabling restarts the app, so it goes through a confirm
 * dialog; a machine with no LAN interface surfaces a clear message.
 */
export function HubHostingIdle() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const enable = useEnableHosting();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirm = async () => {
    try {
      await enable.mutateAsync();
      void queryClient.invalidateQueries({ queryKey: hubKeys.hostingStatus });
      setConfirmOpen(false);
    } catch (error) {
      setConfirmOpen(false);
      toast.error(t(`hub.hosting.enableErrors.${hostingErrorCode(error)}`));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('hub.hosting.idleBody')}</p>
      <Button type="button" className="self-start" onClick={() => setConfirmOpen(true)}>
        <Radio className="h-4 w-4" aria-hidden="true" />
        {t('hub.hosting.enable')}
      </Button>
      <HubRestartConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('hub.hosting.enableConfirmTitle')}
        description={t('hub.hosting.restartNotice')}
        confirmLabel={t('hub.hosting.enableConfirm')}
        pending={enable.isPending}
        onConfirm={onConfirm}
      />
    </div>
  );
}
