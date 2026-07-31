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
} from '@centresoutien/ui';
import type { HolidayInput } from '../../lib/holidays/holiday-view';
import { HolidayForm } from './holiday-form';

type HolidayFormDialogProps = {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: HolidayInput;
  pending: boolean;
  onSubmit: (values: HolidayInput) => void | Promise<void>;
};

/**
 * Presentational shell for the create/edit holiday dialog. Owns no mutation — the
 * flow wrapper (create/edit) passes `onSubmit` and `pending`. Titles and the
 * submit label derive from `mode`, so the two flows share one layout.
 */
export function HolidayFormDialog({
  mode,
  open,
  onOpenChange,
  defaultValues,
  pending,
  onSubmit,
}: HolidayFormDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const submitLabel = mode === 'create' ? t('holidays.form.create') : t('holidays.form.save');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('holidays.form.cancel')}>
        <DialogHeader>
          <DialogTitle>{t(`holidays.form.${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`holidays.form.${mode}Description`)}</DialogDescription>
        </DialogHeader>
        <HolidayForm formId={formId} defaultValues={defaultValues} onSubmit={onSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('holidays.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? t('holidays.form.saving') : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
