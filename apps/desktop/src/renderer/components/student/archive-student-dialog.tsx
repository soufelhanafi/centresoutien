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
import { useArchiveStudent } from '../../hooks/student/use-archive-student';
import type { StudentView } from '../../lib/students/student-view';
import { localizedName } from '../../lib/students/localized-name';

/** Confirms archiving (soft delete). `onArchived` lets the detail page navigate away. */
export function ArchiveStudentDialog({
  student,
  open,
  onOpenChange,
  onArchived,
}: {
  student: StudentView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const archive = useArchiveStudent();

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync(student.id);
      toast.success(t('students.archive.success'));
      onOpenChange(false);
      onArchived?.();
    } catch {
      toast.error(t('students.archive.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('students.archive.title')}</DialogTitle>
          <DialogDescription>
            {t('students.archive.body', { name: localizedName(student, i18n.language) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('students.archive.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={archive.isPending} onClick={handleConfirm}>
            {t('students.archive.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
