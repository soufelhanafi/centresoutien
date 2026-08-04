import { useTranslation } from 'react-i18next';
import { useController, useWatch } from 'react-hook-form';
import { Button, FormControl, FormField, FormItem, FormLabel, Input, cn } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { GeneratorFormControl } from '../../lib/planning/session-generator-schema';
import { GeneratorNumberField } from './generator-number-field';

/**
 * The "how far to generate" section: a start date plus either an explicit end
 * date or a target occurrence count. The count is a **sizing target**, not a
 * guarantee — the domain resolves it per weekday and holidays inside the window
 * still reduce what lands (surfaced at commit), matching `GenerateSessions`'s own
 * holiday-skip semantics.
 */
export function GeneratorRangeFields({ control }: { control: GeneratorFormControl }) {
  const { t } = useTranslation();
  const rangeMode = useWatch({ control, name: 'rangeMode' });
  const rangeModeController = useController({ control, name: 'rangeMode' });

  return (
    <div className="space-y-4">
      <FormItem>
        <FormLabel>{t('planning.generator.range.label')}</FormLabel>
        <div role="group" aria-label={t('planning.generator.range.label')} className="flex gap-2">
          {(['dates', 'count'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              variant={rangeMode === value ? 'default' : 'outline'}
              aria-pressed={rangeMode === value}
              onClick={() => rangeModeController.field.onChange(value)}
              className={cn('flex-1', rangeMode === value && 'font-semibold')}
            >
              {t(`planning.generator.range.${value}`)}
            </Button>
          ))}
        </div>
      </FormItem>

      <div className="flex flex-wrap gap-4">
        <FormField
          control={control}
          name="startDate"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{t('planning.generator.range.startDate')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        {rangeMode === 'dates' ? (
          <FormField
            control={control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('planning.generator.range.endDate')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FieldMessage />
              </FormItem>
            )}
          />
        ) : (
          <GeneratorNumberField
            control={control}
            name="occurrenceCount"
            label={t('planning.generator.range.occurrenceCount')}
            min={1}
          />
        )}
      </div>
    </div>
  );
}
