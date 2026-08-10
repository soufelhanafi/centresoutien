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
  toast,
} from '@centresoutien/ui';
import type { CenterHoursOverrideInput } from '../../lib/center-hours-overrides/override-view';
import { useSaveCenterHoursOverride } from '../../hooks/center-hours-overrides/use-save-center-hours-override';
import { OverrideForm } from './override-form';

/**
 * Create-override flow: owns the save mutation, toasts the result, and closes on
 * success. The form lives inside; the footer's submit targets it by `formId`.
 */
export function OverrideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const save = useSaveCenterHoursOverride();

  const handleSubmit = async (input: CenterHoursOverrideInput) => {
    try {
      await save.mutateAsync(input);
      toast.success(t('centerHoursOverrides.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('centerHoursOverrides.form.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('centerHoursOverrides.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('centerHoursOverrides.form.createDescription')}</DialogDescription>
        </DialogHeader>
        <OverrideForm formId={formId} onSubmit={handleSubmit} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('centerHoursOverrides.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending ? t('centerHoursOverrides.form.saving') : t('centerHoursOverrides.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
