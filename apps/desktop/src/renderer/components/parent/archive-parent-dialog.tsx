import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@centresoutien/ui';
import { useArchiveParent } from '../../hooks/parent/use-archive-parent';
import type { ParentView } from '../../lib/parents/parent-view';

/** Confirms archiving (soft delete). `onArchived` lets the caller close the detail sheet. */
export function ArchiveParentDialog({
  parent,
  open,
  onOpenChange,
  onArchived,
}: {
  parent: ParentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const { t } = useTranslation();
  const archive = useArchiveParent();

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(parent.id);
      toast.success(t('parents.archive.success'));
      onOpenChange(false);
      onArchived?.();
    } catch {
      toast.error(t('parents.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('parents.archive.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('parents.archive.title')}</DialogTitle>
          <DialogDescription>
            {t('parents.archive.body', { name: parent.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('parents.archive.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={archive.isPending} onClick={handleConfirm}>
            {t('parents.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
