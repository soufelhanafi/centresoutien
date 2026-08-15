import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { DEFAULT_WINDOW } from '@centresoutien/domain';
import { Button, FormControl, FormField, FormItem, FormLabel, Input, Switch } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { TeacherAvailabilityFormValues } from './teacher-availability-week-form';

/** The day-level window-list error code set by the schema at `week.<index>.windows`,
 *  which no single input owns — same extraction as the center-hours editor. */
function windowListErrorCode(windowsError: unknown): string {
  if (windowsError === null || typeof windowsError !== 'object') return '';
  const record = windowsError as { message?: unknown; root?: { message?: unknown } };
  const message = record.message ?? record.root?.message;
  return typeof message === 'string' ? message : '';
}

/**
 * One weekday of the teacher's availability (SOU-259): an available/off toggle
 * and, when available, the ordered list of teaching windows with add/remove
 * controls — the same field-array mechanics as the center-hours editor, with
 * teacher-facing wording (available/off, not open/closed). Layout uses logical
 * properties only, so it mirrors cleanly in RTL.
 */
export function TeacherAvailabilityWeekdayRow({ index }: { index: number }) {
  const { t } = useTranslation();
  const { control } = useFormContext<TeacherAvailabilityFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `week.${index}.windows` });
  const { errors } = useFormState({ control, name: `week.${index}.windows` });
  const dayOfWeek = useWatch({ control, name: `week.${index}.dayOfWeek` });
  const isAvailable = fields.length > 0;
  const listErrorCode = windowListErrorCode(errors.week?.[index]?.windows);

  const onToggle = (checked: boolean) => {
    if (checked) append({ ...DEFAULT_WINDOW });
    else remove();
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:gap-6 last:border-b-0">
      <div className="flex items-center gap-3 sm:w-56">
        <Switch
          checked={isAvailable}
          onCheckedChange={onToggle}
          aria-label={t('teachers.availability.toggleLabel', {
            day: t(`centerHours.weekdays.${dayOfWeek}`),
          })}
        />
        <div className="flex flex-col">
          <span className="font-medium">{t(`centerHours.weekdays.${dayOfWeek}`)}</span>
          <span className="text-sm text-muted-foreground">
            {isAvailable ? t('teachers.availability.available') : t('teachers.availability.off')}
          </span>
        </div>
      </div>

      {isAvailable ? (
        <div className="flex flex-1 flex-col gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            {t('teachers.availability.windowsLabel')}
          </span>
          {fields.map((windowField, windowIndex) => (
            <div key={windowField.id} className="flex items-end gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={control}
                  name={`week.${index}.windows.${windowIndex}.open`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('teachers.availability.from')}</FormLabel>
                      <FormControl>
                        <Input type="time" dir="ltr" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FieldMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`week.${index}.windows.${windowIndex}.close`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('teachers.availability.to')}</FormLabel>
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
                onClick={() => remove(windowIndex)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t('teachers.availability.removeWindow')}</span>
              </Button>
            </div>
          ))}
          {listErrorCode ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {t(`errors.${listErrorCode}`)}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => append({ ...DEFAULT_WINDOW })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('teachers.availability.addWindow')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
