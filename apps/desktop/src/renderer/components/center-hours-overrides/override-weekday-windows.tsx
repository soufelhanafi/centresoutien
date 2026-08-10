import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { WeekdayIndex } from '@centresoutien/domain';
import { Button, Switch } from '@centresoutien/ui';
import { defaultWindow, type OverrideFormValues } from '../../lib/center-hours-overrides/override-schema';
import { OverrideWindowRow } from './override-window-row';

type OverrideWeekdayWindowsProps = {
  index: number;
  dayOfWeek: WeekdayIndex;
};

/**
 * One weekday of the override editor: an open/closed toggle and, when open, its
 * ordered list of windows with add/remove controls. Toggling open seeds the
 * first window from the domain defaults; toggling closed clears every window (an
 * empty list is the closed state). Adding a second window is how a center models
 * a mid-day iftar break. Reuses the shared weekday labels (`centerHours.weekdays`).
 */
export function OverrideWeekdayWindows({ index, dayOfWeek }: OverrideWeekdayWindowsProps) {
  const { t } = useTranslation();
  const { control } = useFormContext<OverrideFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `days.${index}.windows` });
  const isOpen = fields.length > 0;

  const onToggle = (checked: boolean) => {
    if (checked) append(defaultWindow());
    else remove();
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 last:border-b-0">
      <div className="flex items-center gap-3">
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
        <div className="flex flex-col gap-3 ps-11">
          {fields.map((field, windowIndex) => (
            <OverrideWindowRow
              key={field.id}
              dayIndex={index}
              windowIndex={windowIndex}
              onRemove={() => remove(windowIndex)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => append(defaultWindow())}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('centerHoursOverrides.form.addWindow')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
