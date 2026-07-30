import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParentInput } from '@centresoutien/domain';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@centresoutien/ui';
import { ParentForm, type ParentFormInput } from './parent-form';

type ParentFormSheetProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: ParentFormInput;
  pending: boolean;
  onSubmit: (values: ParentInput) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit parent drawer. Owns no mutation — the
 * flow wrapper (create/edit) passes `onSubmit` and `pending`. Titles and the
 * submit label derive from `mode`, so the two flows share one layout.
 */
export function ParentFormSheet({
  mode,
  open,
  onOpenChange,
  defaultValues,
  pending,
  onSubmit,
}: ParentFormSheetProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('parents.form.create') : t('parents.form.save');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" closeLabel={t('parents.form.cancel')} className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t(`parents.form.${mode}Title`)}</SheetTitle>
          <SheetDescription>{t(`parents.form.${mode}Description`)}</SheetDescription>
        </SheetHeader>
        <div className="-mx-1 flex-1 overflow-y-auto px-1 py-4">
          <ParentForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </div>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('parents.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('parents.form.saving') : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
