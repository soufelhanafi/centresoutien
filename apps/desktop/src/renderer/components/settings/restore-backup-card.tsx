import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from '@centresoutien/ui';
import { selectFile } from '../../lib/settings/dialog';
import { useRestoreBackup } from '../../hooks/settings/use-restore-backup';
import { RestoreBackupDialog } from './restore-backup-dialog';

const BACKUP_FILE_EXTENSIONS = ['db'];

/** Maps a non-`restored` outcome to its FR/AR error message key (SOU-102 acceptance: fail safely, clear message). */
function outcomeErrorKey(outcome: 'not-found' | 'corrupted' | 'wrong-key'): string {
  switch (outcome) {
    case 'not-found':
      return 'settings.backup.restoreNotFound';
    case 'corrupted':
      return 'settings.backup.restoreCorrupted';
    case 'wrong-key':
      return 'settings.backup.restoreWrongKey';
  }
}

/**
 * Restore flow (SOU-102): pick a backup file, confirm, then swap the live
 * database. On the `'restored'` outcome the main process is about to relaunch
 * the app — this card switches to a blocking "restarting…" state instead of
 * re-enabling itself, since the IPC connection drops shortly after.
 */
export function RestoreBackupCard() {
  const { t } = useTranslation();
  const restoreBackup = useRestoreBackup();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const onPick = async () => {
    const picked = await selectFile(BACKUP_FILE_EXTENSIONS);
    if (picked?.path) setSelectedPath(picked.path);
  };

  const onConfirm = async () => {
    if (!selectedPath) return;
    const result = await restoreBackup.mutateAsync({ path: selectedPath });
    if (result.outcome === 'restored') {
      setRestarting(true);
      return;
    }
    setConfirmOpen(false);
    toast.error(t(outcomeErrorKey(result.outcome)));
  };

  if (restarting) {
    return (
      <Card className="w-full max-w-2xl">
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-foreground">{t('settings.backup.restarting')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.backup.restoreTitle')}</CardTitle>
        <CardDescription>{t('settings.backup.restoreSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <Button type="button" variant="outline" onClick={onPick}>
          <Upload className="size-4" aria-hidden="true" />
          {t('settings.backup.restorePick')}
        </Button>

        {selectedPath && (
          <p dir="ltr" className="break-all text-sm text-muted-foreground">
            {selectedPath}
          </p>
        )}

        <Button
          type="button"
          variant="destructive"
          disabled={!selectedPath}
          onClick={() => setConfirmOpen(true)}
        >
          {t('settings.backup.restoreButton')}
        </Button>
      </CardContent>

      <RestoreBackupDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={onConfirm}
        pending={restoreBackup.isPending}
      />
    </Card>
  );
}
