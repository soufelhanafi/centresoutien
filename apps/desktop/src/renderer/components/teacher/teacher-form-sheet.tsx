import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeacherInput } from '@centresoutien/domain';
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
 * Presentational shell for the create/edit teacher drawer. Owns no mutation —
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('teachers.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t(`teachers.form.${mode}Title`)}</SheetTitle>
          <SheetDescription>{t(`teachers.form.${mode}Description`)}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          <TeacherForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </ScrollArea>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('teachers.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('teachers.form.saving') : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
