import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudentInput } from '@centresoutien/domain';
import {
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@centresoutien/ui';
import { StudentForm } from './student-form';

type StudentFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: StudentInput;
  pending: boolean;
  onSubmit: (values: StudentInput) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit student drawer. Owns no mutation —
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('students.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t(`students.form.${mode}Title`)}</SheetTitle>
          <SheetDescription>{t(`students.form.${mode}Description`)}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          <StudentForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </ScrollArea>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('students.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('students.form.saving') : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
