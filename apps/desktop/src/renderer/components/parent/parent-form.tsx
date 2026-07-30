import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { parentInputSchema, type ParentInput } from '@centresoutien/domain';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Switch,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { RelationField } from './relation-field';

/** Pre-transform shape RHF holds (empty strings), vs the parsed `ParentInput` output. */
export type ParentFormInput = z.input<typeof parentInputSchema>;

/** Blank defaults for the create flow. */
export const EMPTY_PARENT_INPUT: ParentFormInput = {
  name: '',
  phone: '',
  email: '',
  relation: '',
  whatsappOptIn: false,
};

type ParentFormProps = {
  /** Lets the submit button live in the sheet footer, outside the `<form>`. */
  formId: string;
  defaultValues: ParentFormInput;
  onSubmit: (values: ParentInput) => void | Promise<void>;
};

/**
 * The parent create/edit fields, validated by the shared domain schema
 * (`parentInputSchema`). Presentation only — the caller owns the mutation and
 * decides what "submit" means (create vs edit). Phone is required and normalized
 * to E.164 by the schema; email collapses empty back to `null` on submit.
 */
export function ParentForm({ formId, defaultValues, onSubmit }: ParentFormProps) {
  const { t } = useTranslation();
  const form = useForm<ParentFormInput, unknown, ParentInput>({
    resolver: zodResolver(parentInputSchema),
    defaultValues,
  });
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
              <FormLabel>{t('parents.form.name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('parents.form.namePlaceholder')} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('parents.form.phone')}</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  dir="ltr"
                  placeholder={t('parents.form.phonePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('parents.form.email')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder={t('parents.form.emailPlaceholder')}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <RelationField control={form.control} />
        <FormField
          control={form.control}
          name="whatsappOptIn"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3">
              <FormLabel className="font-normal">{t('parents.form.whatsappOptIn')}</FormLabel>
              <FormControl>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
