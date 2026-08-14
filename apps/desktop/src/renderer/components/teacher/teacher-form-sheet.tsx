import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeacherInput } from '@centresoutien/domain';
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
import { TeacherForm, type TeacherFormInput } from './teacher-form';

type TeacherFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: TeacherFormInput;
  pending: boolean;
  onSubmit: (values: TeacherInput) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit teacher dialog. Owns no mutation —
 * the flow wrapper (create/edit) passes `onSubmit` and `pending`. Titles and the
 * submit label derive from `mode`, so the two flows share one layout. Mirrors
 * `StudentFormSheet`.
 */
export function TeacherFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
  pending,
  onSubmit,
}: TeacherFormSheetProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('teachers.form.create') : t('teachers.form.save');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('teachers.form.cancel')}
        className="flex max-h-[85vh] flex-col overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t(`teachers.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`teachers.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          <TeacherForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('teachers.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('teachers.form.saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
