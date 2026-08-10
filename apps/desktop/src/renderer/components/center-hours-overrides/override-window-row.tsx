import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { OverrideFormValues } from '../../lib/center-hours-overrides/override-schema';

type OverrideWindowRowProps = {
  dayIndex: number;
  windowIndex: number;
  onRemove: () => void;
};

/**
 * One open window inside a weekday: an `HH:mm` open and close, plus a remove
 * button. The gap that appears when a day keeps two windows is the mid-day iftar
 * break. Time inputs force `dir="ltr"` (clock digits never mirror); the row
 * layout uses logical properties so the remove control sits at the inline end in
 * both directions.
 */
export function OverrideWindowRow({ dayIndex, windowIndex, onRemove }: OverrideWindowRowProps) {
  const { t } = useTranslation();
  const { control } = useFormContext<OverrideFormValues>();
  const base = `days.${dayIndex}.windows.${windowIndex}` as const;

  return (
    <div className="flex items-end gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <FormField
          control={control}
          name={`${base}.open`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('centerHoursOverrides.form.openLabel')}</FormLabel>
              <FormControl>
                <Input type="time" dir="ltr" {...field} value={field.value ?? ''} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${base}.close`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('centerHoursOverrides.form.closeLabel')}</FormLabel>
              <FormControl>
                <Input type="time" dir="ltr" {...field} value={field.value ?? ''} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mb-1 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{t('centerHoursOverrides.form.removeWindow')}</span>
      </Button>
    </div>
  );
}
