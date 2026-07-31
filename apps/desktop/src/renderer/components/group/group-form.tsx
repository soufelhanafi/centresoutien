import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import {
  groupInputSchema,
  GROUP_CAPACITY_MIN,
  type GroupInput,
} from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useFeature } from '../../hooks/use-feature';
import type { GroupFormOptions } from '../../lib/groups/group-view';
import { GroupPickerFields } from './group-picker-fields';
import { GroupKindField } from './group-kind-field';

/** Pre-transform shape RHF holds, vs the parsed `GroupInput` output. */
export type GroupFormInput = z.input<typeof groupInputSchema>;

/** Blank defaults for the create flow — empty selects, an empty capacity box, regular kind. */
export const EMPTY_GROUP_INPUT: GroupFormInput = {
  subjectId: '',
  teacherId: null,
  roomId: '',
  level: '',
  capacity: Number.NaN,
  kind: 'regular',
};

type GroupFormProps = {
  /** Lets the submit button live in the sheet footer, outside the `<form>`. */
  formId: string;
  defaultValues: GroupFormInput;
  options: GroupFormOptions;
  onSubmit: (values: GroupInput) => void | Promise<void>;
};

/**
 * The group create/edit fields, validated by the shared domain schema
 * (`groupInputSchema`). Presentation only — the caller owns the mutation. Pickers
 * and the (plan-gated) kind selector are split into colocated child fields. The
 * kind field is shown only with `core.exam-prep` (Pro+); on Essentiel the group
 * stays `regular`, matching the domain gate on `CreateGroup`.
 */
export function GroupForm({ formId, defaultValues, options, onSubmit }: GroupFormProps) {
  const { t } = useTranslation();
  const examPrepEnabled = useFeature('core.exam-prep');
  const form = useForm<GroupFormInput, unknown, GroupInput>({
    resolver: zodResolver(groupInputSchema),
    defaultValues,
  });
  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <GroupPickerFields control={form.control} options={options} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('groups.form.level')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('groups.form.levelPlaceholder')} {...field} />
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
                <FormLabel>{t('groups.form.capacity')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={GROUP_CAPACITY_MIN}
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
        </div>

        {examPrepEnabled && <GroupKindField control={form.control} />}
      </form>
    </Form>
  );
}
