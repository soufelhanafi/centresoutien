import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubjectUpdateInput } from '@centresoutien/domain';
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
import { useUpdateSubject } from '../../hooks/subject/use-update-subject';
import type { SubjectView } from '../../lib/subjects/subject-view';
import { EditSubjectForm } from './edit-subject-form';

/** Edit-subject flow (rename): owns the mutation, toasts the result, closes on success. */
export function EditSubjectDialog({
  subject,
  open,
  onOpenChange,
}: {
  subject: SubjectView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const update = useUpdateSubject(subject.id);

  const handleSubmit = async (values: SubjectUpdateInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('subjects.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('subjects.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('subjects.form.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('subjects.form.editTitle')}</DialogTitle>
          <DialogDescription>{t('subjects.form.editDescription')}</DialogDescription>
        </DialogHeader>
        <EditSubjectForm
          formId={formId}
          defaultValues={{ name: { fr: subject.name.fr, ar: subject.name.ar }, active: subject.active }}
          onSubmit={handleSubmit}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('subjects.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={update.isPending}>
            {update.isPending ? t('subjects.form.saving') : t('subjects.form.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
