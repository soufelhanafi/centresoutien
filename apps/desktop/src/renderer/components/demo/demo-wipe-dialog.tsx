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

type DemoWipeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Confirms deleting the demo center (SOU-110). Destructive by design: the wipe
 * swaps back to the real center in place (SOU-186), then deletes every demo
 * artefact. Presentational — the caller owns the `useWipeDemo` mutation.
 */
export function DemoWipeDialog({ open, onOpenChange, onConfirm, pending }: DemoWipeDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('demo.wipeDialog.title')}</DialogTitle>
          <DialogDescription>{t('demo.wipeDialog.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('demo.wipeDialog.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t('demo.active.wiping') : t('demo.wipeDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
