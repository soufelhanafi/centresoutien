import { useTranslation } from 'react-i18next';
import { WEEKDAYS } from '@centresoutien/domain';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { SessionFormControl } from '../../lib/planning/session-form-schema';

/**
 * The weekday + `[start, end)` time range of the session form. Split out of
 * `session-form.tsx` to keep each file under the size ceiling. Times are
 * `type="time"` inputs forced `dir="ltr"` (a 24-hour clock reads the same in RTL);
 * the end-after-start rule is validated by the schema and surfaced on `end`.
 */
export function SessionScheduleFields({ control }: { control: SessionFormControl }) {
  const { t } = useTranslation();

  return (
    <>
      <FormField
        control={control}
        name="dayOfWeek"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('planning.form.day')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={t('planning.form.dayPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {WEEKDAYS.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {t(`planning.weekdays.${day}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="start"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('planning.form.start')}</FormLabel>
              <FormControl>
                <Input type="time" dir="ltr" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="end"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('planning.form.end')}</FormLabel>
              <FormControl>
                <Input type="time" dir="ltr" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
