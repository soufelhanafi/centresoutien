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

type CancelSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Confirms cancelling (soft-deleting) a weekly session. Presentational — the edit
 * flow owns the mutation and passes `onConfirm`/`pending`. Soft delete only: the
 * row leaves the grid but survives as a syncable tombstone (CLAUDE.md §5).
 */
export function CancelSessionDialog({ open, onOpenChange, onConfirm, pending }: CancelSessionDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('planning.cancelSession.dismiss')}>
        <DialogHeader>
          <DialogTitle>{t('planning.cancelSession.title')}</DialogTitle>
          <DialogDescription>{t('planning.cancelSession.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('planning.cancelSession.dismiss')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t('planning.cancelSession.pending') : t('planning.cancelSession.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
