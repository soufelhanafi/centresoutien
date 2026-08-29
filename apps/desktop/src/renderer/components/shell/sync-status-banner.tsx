import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useFeature } from '../../hooks/use-feature';
import { useSyncInProgress } from '../../hooks/sync/use-sync';

/**
 * Ambient, non-blocking status strip shown in the app shell while a sync is
 * running anywhere in the app — the Sync page's own "Synchroniser maintenant"
 * button today, any future auto-trigger tomorrow. The user keeps navigating
 * and working; this is purely informational (`aria-live="polite"` so a
 * screen reader announces it without interrupting whatever the user is
 * doing). Renders nothing on a plan without `sync.multi-device` and nothing
 * while no sync is in flight — no permanent chrome for a feature that may
 * never run.
 */
export function SyncStatusBanner() {
  const { t } = useTranslation();
  const hasSync = useFeature('sync.multi-device');
  const inProgress = useSyncInProgress();

  if (!hasSync || !inProgress) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary print:hidden"
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin rtl:scale-x-[-1]" aria-hidden="true" />
      {t('shell.syncBanner.inProgress')}
    </div>
  );
}
