import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { subjectInputSchema, SUBJECT_CODE_MAX, type SubjectInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { withOptionalArabicName } from '../../lib/forms/optional-arabic-name';

/** Blank defaults for the create flow. `code` is optional and starts empty. */
export const EMPTY_SUBJECT_INPUT: SubjectInput = { name: { fr: '', ar: '' }, code: '' };

/** A server-side field error from a failed save (e.g. `{ code: 'duplicate-subject-code' }`). */
export type SubjectFormServerFieldError = { readonly code: string };

type SubjectFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: SubjectInput;
  onSubmit: (values: SubjectInput) => void | Promise<void>;
  /** Server-side error on the code field, shown inline. Fresh identity per rejection. */
  serverCodeError?: SubjectFormServerFieldError | null;
};

/**
 * The subject **create** fields (bilingual name + optional code), validated by
 * the shared domain schema (`subjectInputSchema`). Presentation only — the
 * caller owns the mutation. `code` is not part of the update path (SOU-122): it
 * only ever renders here, never in {@link EditSubjectForm}.
 */
export function SubjectForm({ formId, defaultValues, onSubmit, serverCodeError = null }: SubjectFormProps) {
  const { t } = useTranslation();
  const form = useForm<SubjectInput>({
    resolver: withOptionalArabicName(zodResolver(subjectInputSchema)),
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
              <FormLabel>{t('subjects.form.nameFr')}</FormLabel>
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
              <FormLabel>{t('subjects.form.nameAr')}</FormLabel>
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

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('subjects.form.code')}</FormLabel>
              <FormControl>
                <Input
                  dir="ltr"
                  maxLength={SUBJECT_CODE_MAX}
                  placeholder={t('subjects.form.codePlaceholder')}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(event) => {
                    field.onChange(event);
                    form.clearErrors('code');
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('subjects.form.codeHint')}</p>
              <FieldMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
