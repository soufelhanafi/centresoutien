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

type DemoHubWarnDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
};

/**
 * Warns before entering demo mode on a laptop that is the LAN hub host
 * (SOU-190): `demo.create` silently stops the embedded hub, cutting off
 * teammates' sync. Non-destructive — the demo still proceeds on confirm, the
 * warning only makes the trade-off explicit. Presentational — the caller owns
 * the `useCreateDemoWithHubGuard` hook.
 */
export function DemoHubWarnDialog({ open, onOpenChange, onConfirm, pending }: DemoHubWarnDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('demo.hubWarn.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('demo.hubWarn.title')}</DialogTitle>
          <DialogDescription>{t('demo.hubWarn.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('demo.hubWarn.cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? t('demo.intro.creating') : t('demo.hubWarn.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
