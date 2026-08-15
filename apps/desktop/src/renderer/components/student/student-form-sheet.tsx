import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '@centresoutien/ui';
import { StudentForm } from './student-form';
import type { StudentNiveauFormValues } from '../../lib/niveaux/form-schemas';

type StudentFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: StudentNiveauFormValues;
  pending: boolean;
  onSubmit: (values: StudentNiveauFormValues) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit student dialog. Owns no mutation —
 * the flow wrapper (create/edit) passes `onSubmit` and `pending`. Titles and the
 * submit label derive from `mode`, so the two flows share one layout.
 */
export function StudentFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
  pending,
  onSubmit,
}: StudentFormSheetProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('students.form.create') : t('students.form.save');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('students.form.cancel')}
        className="flex max-h-[85vh] flex-col overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t(`students.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`students.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          <StudentForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('students.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('students.form.saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
