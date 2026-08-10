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
import { useArchiveTeacher } from '../../hooks/teacher/use-archive-teacher';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { localizedName } from '../../lib/teachers/localized-name';

/**
 * Confirms archiving (soft delete). `onArchived` lets the detail page navigate
 * away. A teacher still referenced by groups/payroll is rejected by the domain
 * (`TeacherInUseError`); that surfaces here as the generic archive-error toast,
 * matching the parents/students flows.
 */
export function ArchiveTeacherDialog({
  teacher,
  open,
  onOpenChange,
  onArchived,
}: {
  teacher: TeacherView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveTeacher();

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(teacher.id);
      toast.success(t('teachers.archive.success'));
      onOpenChange(false);
      onArchived?.();
    } catch {
      toast.error(t('teachers.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('teachers.archive.title')}</DialogTitle>
          <DialogDescription>
            {t('teachers.archive.body', { name: localizedName(teacher, i18n.language) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('teachers.archive.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={archive.isPending} onClick={handleConfirm}>
            {t('teachers.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
