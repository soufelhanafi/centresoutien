import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, Input, Textarea } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { NiveauSelectField } from '../niveau/niveau-select-field';
import {
  studentNiveauFormSchema,
  type StudentNiveauFormValues,
} from '../../lib/niveaux/form-schemas';

/** Pre-transform shape RHF holds (empty strings), vs the parsed output. */
type StudentFormInput = z.input<typeof studentNiveauFormSchema>;

/** Blank defaults for the create flow. `guardianIds` is carried, never edited here. */
export const EMPTY_STUDENT_INPUT: StudentNiveauFormValues = {
  name: { fr: '', ar: '' },
  birthDate: '',
  level: '',
  niveauId: null,
  school: null,
  notes: null,
  guardianIds: [],
};

type StudentFormProps = {
  /** Lets the submit button live in the sheet footer, outside the `<form>`. */
  formId: string;
  defaultValues: StudentNiveauFormValues;
  onSubmit: (values: StudentNiveauFormValues) => void | Promise<void>;
};

/**
 * The student create/edit fields, validated by the shared domain schema
 * (`studentInputSchema`) extended with the SOU-260 `niveauId`. Presentation only
 * — the caller owns the mutation and decides what "submit" means (create vs
 * edit). Nullable fields render `''` and the schema's transform collapses empty
 * back to `null` on submit.
 */
export function StudentForm({ formId, defaultValues, onSubmit }: StudentFormProps) {
  const { t } = useTranslation();
  const form = useForm<StudentFormInput, unknown, StudentNiveauFormValues>({
    resolver: zodResolver(studentNiveauFormSchema),
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
        <NiveauSelectField />
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
