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

type ExcelBackupApplyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Confirms committing an Excel import's created/updated rows (SOU-44
 * acceptance: import always goes through an explicit confirmation step).
 * Presentational — `ExcelBackupPreview` owns the apply mutation and the file
 * path. Unlike restore (which replaces everything), apply is additive, so the
 * confirm button is primary, not destructive.
 */
export function ExcelBackupApplyDialog({ open, onOpenChange, onConfirm, pending }: ExcelBackupApplyDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('settings.backup.excel.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('settings.backup.excel.confirmBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('settings.backup.excel.confirmCancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? t('settings.backup.excel.applyPending') : t('settings.backup.excel.confirmApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
