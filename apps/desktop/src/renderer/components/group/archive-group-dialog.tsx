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
import { useArchiveGroup } from '../../hooks/group/use-archive-group';
import { localizedName } from '../../lib/groups/localized-name';
import type { GroupRow } from '../../lib/groups/group-view';

/**
 * Confirms archiving (soft delete). `onArchived` lets the detail page navigate
 * away. A group still referenced downstream would be rejected by the domain; that
 * surfaces here as the generic archive-error toast, matching the teacher flow.
 */
export function ArchiveGroupDialog({
  group,
  open,
  onOpenChange,
  onArchived,
}: {
  group: GroupRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveGroup();
  const name = `${localizedName(group.subjectName, i18n.language)} · ${group.level}`;

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(group.id);
      toast.success(t('groups.archive.success'));
      onOpenChange(false);
      onArchived?.();
    } catch {
      toast.error(t('groups.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('groups.archive.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('groups.archive.title')}</DialogTitle>
          <DialogDescription>{t('groups.archive.body', { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('groups.archive.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={archive.isPending}
            onClick={handleConfirm}
          >
            {t('groups.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
