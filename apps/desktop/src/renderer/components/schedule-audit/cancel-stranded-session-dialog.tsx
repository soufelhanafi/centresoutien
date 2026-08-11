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

type CancelStrandedSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Confirms cancelling ONE dated session occurrence from the audit report. Its
 * copy makes explicit that only this date is removed — the weekly recurring
 * session and its other dates stay — so the planner's series-oriented
 * `CancelSessionDialog` is deliberately not reused here. Soft delete only: the
 * row leaves as a syncable tombstone (CLAUDE.md §5).
 */
export function CancelStrandedSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: CancelStrandedSessionDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('scheduleAudit.cancel.title')}</DialogTitle>
          <DialogDescription>{t('scheduleAudit.cancel.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('scheduleAudit.cancel.dismiss')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t('scheduleAudit.cancel.pending') : t('scheduleAudit.cancel.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
