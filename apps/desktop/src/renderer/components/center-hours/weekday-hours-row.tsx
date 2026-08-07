import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CLOSE, DEFAULT_OPEN } from '@centresoutien/domain';
import { FormControl, FormField, FormItem, FormLabel, Input, Switch } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { CenterHoursFormValues } from './types';

/**
 * One weekday's row: an open/closed toggle and, when open, two `HH:mm` time
 * inputs. Toggling closed nulls both times (the schema's closed state); toggling
 * open restores the domain defaults so the user starts from sensible hours.
 * Layout uses logical properties only, so it mirrors cleanly in RTL.
 */
export function WeekdayHoursRow({ index }: { index: number }) {
  const { t } = useTranslation();
  const { control, setValue } = useFormContext<CenterHoursFormValues>();
  const dayOfWeek = useWatch({ control, name: `week.${index}.dayOfWeek` });
  const open = useWatch({ control, name: `week.${index}.open` });
  const isOpen = open !== null;

  const onToggle = (checked: boolean) => {
    const options = { shouldValidate: true, shouldDirty: true } as const;
    setValue(`week.${index}.open`, checked ? DEFAULT_OPEN : null, options);
    setValue(`week.${index}.close`, checked ? DEFAULT_CLOSE : null, options);
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:gap-6 last:border-b-0">
      <div className="flex items-center gap-3 sm:w-56">
        <Switch
          checked={isOpen}
          onCheckedChange={onToggle}
          aria-label={t('centerHours.toggleLabel', { day: t(`centerHours.weekdays.${dayOfWeek}`) })}
        />
        <div className="flex flex-col">
          <span className="font-medium">{t(`centerHours.weekdays.${dayOfWeek}`)}</span>
          <span className="text-sm text-muted-foreground">
            {isOpen ? t('centerHours.open') : t('centerHours.closed')}
          </span>
        </div>
      </div>

      {isOpen ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name={`week.${index}.open`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('centerHours.openLabel')}</FormLabel>
                <FormControl>
                  <Input type="time" dir="ltr" {...field} value={field.value ?? ''} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`week.${index}.close`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('centerHours.closeLabel')}</FormLabel>
                <FormControl>
                  <Input type="time" dir="ltr" {...field} value={field.value ?? ''} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}
