import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { HolidayInput, HolidayView } from '../../lib/holidays/holiday-view';
import { useUpdateHoliday } from '../../hooks/holiday/use-update-holiday';
import { HolidayFormDialog } from './holiday-form-dialog';

/** Maps the read view back to the editable input shape. */
function toInput(holiday: HolidayView): HolidayInput {
  return {
    name: { fr: holiday.name.fr, ar: holiday.name.ar },
    kind: holiday.kind,
    startDate: holiday.startDate,
    endDate: holiday.endDate,
  };
}

/** Edit-holiday flow: owns the mutation, toasts the result, closes on success. */
export function EditHolidayDialog({
  holiday,
  open,
  onOpenChange,
}: {
  holiday: HolidayView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateHoliday(holiday.id);

  const handleSubmit = async (values: HolidayInput) => {
    try {
      await update.mutateAsync(values);
      toast.success(t('holidays.form.editSuccess'));
      onOpenChange(false);
    } catch {
      toast.error(t('holidays.form.error'));
    }
  };

  return (
    <HolidayFormDialog
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      defaultValues={toInput(holiday)}
      pending={update.isPending}
      onSubmit={handleSubmit}
    />
  );
}
