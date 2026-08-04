import { FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import type { GeneratorFormControl, GeneratorFormValues } from '../../lib/planning/session-generator-schema';

/** The numeric config fields — the only form values registered as `type="number"`. */
type NumericFieldName = 'sessionsPerWeek' | 'minGapDays' | 'sessionDurationMinutes' | 'occurrenceCount';

/**
 * A single integer config field wired to RHF. Coerces the native input's string
 * to a number on change (empty → `NaN`, which the Zod schema reports as
 * `required`), so every numeric field shares one validated, size-capped shell
 * instead of repeating the `valueAsNumber` boilerplate four times.
 */
export function GeneratorNumberField({
  control,
  name,
  label,
  min,
}: {
  control: GeneratorFormControl;
  name: NumericFieldName;
  label: string;
  min: number;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const value = field.value as GeneratorFormValues[NumericFieldName];
        return (
          <FormItem className="flex-1">
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input
                type="number"
                inputMode="numeric"
                min={min}
                value={Number.isNaN(value) ? '' : value}
                onChange={(event) => field.onChange(event.target.valueAsNumber)}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </FormControl>
            <FieldMessage />
          </FormItem>
        );
      }}
    />
  );
}
