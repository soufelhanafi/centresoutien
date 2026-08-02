import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { subjectUpdateInputSchema, type SubjectUpdateInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';

type EditSubjectFormProps = {
  /** Lets the submit button live in the dialog footer, outside the `<form>`. */
  formId: string;
  defaultValues: SubjectUpdateInput;
  onSubmit: (values: SubjectUpdateInput) => void | Promise<void>;
};

/**
 * The subject **rename** fields — bilingual name only. `code` is a sync-relevant
 * natural key (SOU-122) and is never editable. `active` is not rendered here
 * either: deactivate/reactivate is its own quick row action, not part of the
 * rename dialog — but the field stays registered via `defaultValues` (unchanged)
 * so a rename submit round-trips the same `subjectUpdateInputSchema` the domain
 * requires without silently flipping the flag.
 */
export function EditSubjectForm({ formId, defaultValues, onSubmit }: EditSubjectFormProps) {
  const { t } = useTranslation();
  const form = useForm<SubjectUpdateInput>({
    resolver: zodResolver(subjectUpdateInputSchema),
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
                <Input lang="ar" dir="rtl" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
