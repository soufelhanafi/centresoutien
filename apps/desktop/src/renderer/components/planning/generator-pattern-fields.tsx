import { useTranslation } from 'react-i18next';
import { useController, useWatch } from 'react-hook-form';
import { Lock } from 'lucide-react';
import { Button, FormItem, FormLabel, cn } from '@centresoutien/ui';
import type { GeneratorFormControl } from '../../lib/planning/session-generator-schema';
import { useFeature } from '../../hooks/use-feature';
import { GeneratorWeekdayPicker } from './generator-weekday-picker';
import { GeneratorNumberField } from './generator-number-field';

/**
 * The "how to spread the sessions" section: the eligible weekday pool, the
 * auto/custom mode toggle, and the constraints. In `auto` mode the admin sets
 * how many sessions a week the engine should place from the pool; in `custom`
 * mode they pick the exact weekdays and the engine only validates the gap
 * (flagged, never blocked). `minGapDays` and the session duration apply to both.
 */
export function GeneratorPatternFields({ control }: { control: GeneratorFormControl }) {
  const { t } = useTranslation();
  const hasRandomAuto = useFeature('planning.random-auto');
  const mode = useWatch({ control, name: 'mode' });
  const modeController = useController({ control, name: 'mode' });
  const poolController = useController({ control, name: 'weekdayPool' });
  const pickedController = useController({ control, name: 'pickedWeekdays' });
  const poolError = poolController.fieldState.error?.message;
  const pickedError = pickedController.fieldState.error?.message;

  return (
    <div className="space-y-4">
      <FormItem>
        <FormLabel>{t('planning.generator.weekdayPool')}</FormLabel>
        <GeneratorWeekdayPicker
          value={poolController.field.value}
          onChange={poolController.field.onChange}
          ariaLabel={t('planning.generator.weekdayPool')}
        />
        {poolError ? <p className="text-sm font-medium text-destructive">{t(`errors.${poolError}`)}</p> : null}
      </FormItem>

      <FormItem>
        <FormLabel>{t('planning.generator.mode.label')}</FormLabel>
        <div role="group" aria-label={t('planning.generator.mode.label')} className="flex gap-2">
          {(['auto', 'custom'] as const).map((value) => {
            const locked = value === 'auto' && !hasRandomAuto;
            return (
              <Button
                key={value}
                type="button"
                variant={mode === value ? 'default' : 'outline'}
                aria-pressed={mode === value}
                disabled={locked}
                onClick={() => modeController.field.onChange(value)}
                className={cn('flex-1', mode === value && 'font-semibold')}
              >
                {t(`planning.generator.mode.${value}`)}
                {locked ? (
                  <Lock
                    className="h-3.5 w-3.5"
                    aria-label={t('planning.generator.mode.autoLocked')}
                  />
                ) : null}
              </Button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">{t(`planning.generator.mode.${mode}Hint`)}</p>
      </FormItem>

      {mode === 'auto' ? (
        <GeneratorNumberField
          control={control}
          name="sessionsPerWeek"
          label={t('planning.generator.sessionsPerWeek')}
          min={1}
        />
      ) : (
        <FormItem>
          <FormLabel>{t('planning.generator.pickedWeekdays')}</FormLabel>
          <GeneratorWeekdayPicker
            value={pickedController.field.value}
            onChange={pickedController.field.onChange}
            ariaLabel={t('planning.generator.pickedWeekdays')}
          />
          {pickedError ? <p className="text-sm font-medium text-destructive">{t(`errors.${pickedError}`)}</p> : null}
        </FormItem>
      )}

      <div className="flex flex-wrap gap-4">
        <GeneratorNumberField control={control} name="minGapDays" label={t('planning.generator.minGapDays')} min={0} />
        <GeneratorNumberField
          control={control}
          name="sessionDurationMinutes"
          label={t('planning.generator.duration')}
          min={1}
        />
      </div>
    </div>
  );
}
