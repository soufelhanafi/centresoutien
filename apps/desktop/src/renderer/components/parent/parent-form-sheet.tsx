import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParentInput } from '@centresoutien/domain';
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
 * Presentational shell for the create/edit parent dialog. Owns no mutation — the
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('parents.form.cancel')}
        className="flex max-h-[85vh] flex-col overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t(`parents.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`parents.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1" contentClassName="-mx-1 px-1 py-4">
          <ParentForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('parents.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('parents.form.saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
