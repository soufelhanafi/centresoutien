import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@centresoutien/ui';

type RestoreBackupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Confirms replacing the live center database with a picked backup file
 * (SOU-102 acceptance: restore always goes through an explicit confirmation
 * step). Presentational — `RestoreBackupCard` owns the mutation and the
 * picked path. Mirrors `CancelSessionDialog`.
 */
export function RestoreBackupDialog({ open, onOpenChange, onConfirm, pending }: RestoreBackupDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('settings.backup.confirmDismiss')}>
        <DialogHeader>
          <DialogTitle>{t('settings.backup.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('settings.backup.confirmBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('settings.backup.confirmDismiss')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t('settings.backup.confirmPending') : t('settings.backup.confirmConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
