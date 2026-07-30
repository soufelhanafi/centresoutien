import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { roomInputSchema, ROOM_CAPACITY_MIN, type RoomInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';

/**
 * Blank defaults for the create flow. `capacity` starts as `NaN` — a type-safe
 * "empty number" the field renders as an empty box; on submit the shared schema
 * rejects it (capacity must be an integer ≥ 1) so the user gets a real error
 * instead of a fabricated seat count.
 */
export const EMPTY_ROOM_INPUT: RoomInput = { name: '', capacity: Number.NaN };

type RoomFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: RoomInput;
  onSubmit: (values: RoomInput) => void | Promise<void>;
};

/**
 * The room create/edit fields (name + seat capacity), validated by the shared
 * domain schema (`roomInputSchema`). Presentation only — the caller owns the
 * mutation and decides what "submit" means (create vs edit). `name` is a plain
 * label (a room like "Salle A" is not translated), so it renders LTR in both
 * locales.
 */
export function RoomForm({ formId, defaultValues, onSubmit }: RoomFormProps) {
  const { t } = useTranslation();
  const form = useForm<RoomInput>({ resolver: zodResolver(roomInputSchema), defaultValues });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rooms.form.name')}</FormLabel>
              <FormControl>
                <Input dir="ltr" placeholder={t('rooms.form.namePlaceholder')} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="capacity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('rooms.form.capacity')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={ROOM_CAPACITY_MIN}
                  dir="ltr"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={Number.isNaN(field.value) ? '' : field.value}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? Number.NaN : event.target.valueAsNumber)
                  }
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
