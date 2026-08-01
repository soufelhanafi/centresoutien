import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubjectInput } from '@centresoutien/domain';
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
import { useCreateSubject } from '../../hooks/subject/use-create-subject';
import { mapSubjectWriteError } from '../../lib/subjects/subject-write-error';
import { SubjectForm, EMPTY_SUBJECT_INPUT } from './subject-form';

/**
 * Create-subject flow: owns the mutation, toasts the result, closes on success.
 * A `DuplicateSubjectCodeError` (a code already live in this center) gets its own
 * localized toast; any other failure falls back to the generic save-error toast.
 */
export function CreateSubjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const create = useCreateSubject();

  const handleSubmit = async (values: SubjectInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('subjects.form.createSuccess'));
      onOpenChange(false);
    } catch (error) {
      const code = mapSubjectWriteError(error);
      toast.error(t(code ? `errors.${code}` : 'subjects.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('subjects.form.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('subjects.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('subjects.form.createDescription')}</DialogDescription>
        </DialogHeader>
        <SubjectForm formId={formId} defaultValues={EMPTY_SUBJECT_INPUT} onSubmit={handleSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('subjects.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending ? t('subjects.form.saving') : t('subjects.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
