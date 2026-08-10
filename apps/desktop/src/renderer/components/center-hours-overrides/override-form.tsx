import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { WeekdayIndex } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import {
  emptyOverrideForm,
  overrideFormSchema,
  overrideFormToInput,
  type OverrideFormValues,
} from '../../lib/center-hours-overrides/override-schema';
import type { CenterHoursOverrideInput } from '../../lib/center-hours-overrides/override-view';
import { OverrideWeekdayWindows } from './override-weekday-windows';

type OverrideFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  onSubmit: (input: CenterHoursOverrideInput) => void | Promise<void>;
};

/**
 * The dated-override editor: an inclusive date range plus per-weekday windows,
 * validated by {@link overrideFormSchema} (close after open, no overlap, end on
 * or after start). Presentation only — the caller owns the mutation. Date inputs
 * stay LTR; the weekday grid mirrors cleanly via logical properties.
 */
export function OverrideForm({ formId, onSubmit }: OverrideFormProps) {
  const { t } = useTranslation();
  const form = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideFormSchema),
    defaultValues: emptyOverrideForm(),
  });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(overrideFormToInput(values));
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('centerHoursOverrides.form.startDate')}</FormLabel>
                <FormControl>
                  <Input type="date" dir="ltr" {...field} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('centerHoursOverrides.form.endDate')}</FormLabel>
                <FormControl>
                  <Input type="date" dir="ltr" {...field} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground">
            {t('centerHoursOverrides.form.weekdaysHeading')}
          </p>
          {form.getValues('days').map((day, index) => (
            <OverrideWeekdayWindows
              key={day.dayOfWeek}
              index={index}
              dayOfWeek={day.dayOfWeek as WeekdayIndex}
            />
          ))}
        </div>
      </form>
    </Form>
  );
}
