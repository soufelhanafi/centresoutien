import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParentInput } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
      <DialogContent closeLabel={t('parents.form.cancel')}>
        <DialogHeader>
          <DialogTitle>{t(`parents.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`parents.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ParentForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        </DialogBody>
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
