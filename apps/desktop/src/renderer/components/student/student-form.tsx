import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { studentInputSchema, type StudentInput } from '@centresoutien/domain';

/** Pre-transform shape RHF holds (empty strings), vs the parsed `StudentInput` output. */
type StudentFormInput = z.input<typeof studentInputSchema>;
import { Form, FormControl, FormField, FormItem, FormLabel, Input, Textarea } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';

/** Blank defaults for the create flow. `guardianIds` is carried, never edited here. */
export const EMPTY_STUDENT_INPUT: StudentInput = {
  name: { fr: '', ar: '' },
  birthDate: '',
  level: '',
  school: null,
  notes: null,
  guardianIds: [],
};

type StudentFormProps = {
  /** Lets the submit button live in the sheet footer, outside the `<form>`. */
  formId: string;
  defaultValues: StudentInput;
  onSubmit: (values: StudentInput) => void | Promise<void>;
};

/**
 * The student create/edit fields, validated by the shared domain schema
 * (`studentInputSchema`). Presentation only — the caller owns the mutation and
 * decides what "submit" means (create vs edit). Nullable fields render `''` and
 * the schema's transform collapses empty back to `null` on submit.
 */
export function StudentForm({ formId, defaultValues, onSubmit }: StudentFormProps) {
  const { t } = useTranslation();
  const form = useForm<StudentFormInput, unknown, StudentInput>({
    resolver: zodResolver(studentInputSchema),
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
              <FormLabel>{t('students.form.nameFr')}</FormLabel>
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
              <FormLabel>{t('students.form.nameAr')}</FormLabel>
              <FormControl>
                <Input lang="ar" dir="rtl" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="birthDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('students.form.birthDate')}</FormLabel>
              <FormControl>
                <Input type="date" dir="ltr" {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('students.form.level')}</FormLabel>
              <FormControl>
                <Input placeholder={t('students.form.levelPlaceholder')} {...field} />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="school"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('students.form.school')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('students.form.schoolPlaceholder')}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('students.form.notes')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('students.form.notesPlaceholder')}
                  {...field}
                  value={field.value ?? ''}
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
