import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { withOptionalArabicName } from '../../lib/forms/optional-arabic-name';
import { NIVEAU_CATEGORIES, NIVEAU_CODE_MAX, niveauInputSchema, type NiveauCategory } from '@centresoutien/domain';

/** Pre-transform shape RHF holds (empty strings), vs the parsed output. */
export type NiveauFormInput = z.input<typeof niveauInputSchema>;
export type NiveauFormValues = z.output<typeof niveauInputSchema>;

/** Blank defaults for the create flow. `code` is optional and starts empty. */
export const EMPTY_NIVEAU_INPUT: NiveauFormInput = {
  name: { fr: '', ar: '' },
  code: '',
  category: 'primaire',
};

/** A server-side field error from a failed save (e.g. `{ code: 'duplicate-niveau-code' }`). */
export type NiveauFormServerFieldError = { readonly code: string };

type NiveauFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: NiveauFormInput;
  onSubmit: (values: NiveauFormValues) => void | Promise<void>;
  /** Server-side error on the code field, shown inline. Fresh identity per rejection. */
  serverCodeError?: NiveauFormServerFieldError | null;
};

export function niveauCategoryLabelKey(category: NiveauCategory): string {
  return `niveaux.category.${category}`;
}

/**
 * The niveau create/edit fields (bilingual name + optional code + category),
 * validated by the local schema mirroring the domain's `niveauInputSchema`.
 * Presentation only — the caller owns the mutation.
 */
export function NiveauForm({ formId, defaultValues, onSubmit, serverCodeError = null }: NiveauFormProps) {
  const { t } = useTranslation();
  const form = useForm<NiveauFormInput, unknown, NiveauFormValues>({
    resolver: withOptionalArabicName(zodResolver(niveauInputSchema)),
    defaultValues,
  });

  useEffect(() => {
    if (serverCodeError) form.setError('code', { message: serverCodeError.code });
    else form.clearErrors('code');
  }, [serverCodeError, form]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name.fr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('niveaux.form.nameFr')}</FormLabel>
              <FormControl>
                <Input lang="fr" dir="ltr" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name.ar"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('niveaux.form.nameAr')}</FormLabel>
              <FormControl>
                <Input
                  lang="ar"
                  dir="rtl"
                  placeholder={t('common.arabicNameOptionalPlaceholder')}
                  {...field}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('common.arabicNameOptionalHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('niveaux.form.code')}</FormLabel>
                <FormControl>
                  <Input
                    dir="ltr"
                    maxLength={NIVEAU_CODE_MAX}
                    placeholder={t('niveaux.form.codePlaceholder')}
                    {...field}
                    value={field.value ?? ''}
                    onChange={(event) => {
                      field.onChange(event);
                      form.clearErrors('code');
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">{t('niveaux.form.codeHint')}</p>
                <FieldMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('niveaux.form.category')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('niveaux.form.categoryPlaceholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {NIVEAU_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t(niveauCategoryLabelKey(category))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}
