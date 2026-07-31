import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { HolidayInput } from '../../lib/holidays/holiday-view';
import { useCreateHoliday } from '../../hooks/holiday/use-create-holiday';
import { HolidayFormDialog } from './holiday-form-dialog';
import { EMPTY_HOLIDAY_INPUT } from './holiday-form';

/** Create-holiday flow: owns the mutation, toasts the result, closes on success. */
export function CreateHolidayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateHoliday();

  const handleSubmit = async (values: HolidayInput) => {
    try {
      await create.mutateAsync(values);
      toast.success(t('holidays.form.createSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('holidays.form.error'));
    }
  };

  return (
    <HolidayFormDialog
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={EMPTY_HOLIDAY_INPUT}
      pending={create.isPending}
      onSubmit={handleSubmit}
    />
  );
}
