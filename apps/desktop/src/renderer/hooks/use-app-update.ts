import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { UpdateStatusEvent } from '../../shared/ipc/update-events';

const UPDATE_TOAST_ID = 'app-update-ready';

/**
 * SOU-87: surfaces a downloaded update as a persistent toast with a restart
 * action. Only the `downloaded` state is user-facing — checking/downloading are
 * silent by design. On Windows the restart applies the update; on unsigned
 * macOS the download never completes, so this toast simply never appears there.
 */
export function useAppUpdate(): void {
  const { t } = useTranslation();

  useEffect(() => {
    const dispose = window.api.onUpdateStatus((event: UpdateStatusEvent) => {
      if (event.state !== 'downloaded') {
        return;
      }
      toast(t('update.readyTitle'), {
        id: UPDATE_TOAST_ID,
        description: t('update.readyDescription', { version: event.version }),
        duration: Infinity,
        action: {
          label: t('update.restartNow'),
          onClick: () => window.api.restartNow(),
        },
      });
    });
    return dispose;
  }, [t]);
}
