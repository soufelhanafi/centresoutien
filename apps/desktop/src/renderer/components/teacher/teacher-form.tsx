import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { teacherInputSchema, type TeacherInput } from '@centresoutien/domain';
import { Form, FormControl, FormField, FormItem, FormLabel, Input } from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { TeacherSubjectsField } from './teacher-subjects-field';

/** Pre-transform shape RHF holds (empty strings), vs the parsed `TeacherInput` output. */
export type TeacherFormInput = z.input<typeof teacherInputSchema>;

/**
 * Blank defaults for the create flow. `subjectIds` starts empty and is edited via
 * the {@link TeacherSubjectsField} multi-select (SOU-124); on edit the teacher's
 * existing links are passed in and preserved.
 */
export const EMPTY_TEACHER_INPUT: TeacherFormInput = {
  name: { fr: '', ar: '' },
  cin: '',
  phone: '',
  email: '',
  subjectIds: [],
};

type TeacherFormProps = {
  /** Lets the submit button live in the sheet footer, outside the `<form>`. */
  formId: string;
  defaultValues: TeacherFormInput;
  onSubmit: (values: TeacherInput) => void | Promise<void>;
};

/**
 * The teacher create/edit fields, validated by the shared domain schema
 * (`teacherInputSchema`). Presentation only — the caller owns the mutation and
 * decides what "submit" means (create vs edit). Phone is required and normalized
 * to E.164 by the schema; CIN and email collapse empty back to `null` on submit.
 */
export function TeacherForm({ formId, defaultValues, onSubmit }: TeacherFormProps) {
  const { t } = useTranslation();
  const form = useForm<TeacherFormInput, unknown, TeacherInput>({
    resolver: zodResolver(teacherInputSchema),
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
              <FormLabel>{t('teachers.form.nameFr')}</FormLabel>
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
              <FormLabel>{t('teachers.form.nameAr')}</FormLabel>
              <FormControl>
                <Input lang="ar" dir="rtl" {...field} />
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
              <FormLabel>{t('teachers.form.phone')}</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  dir="ltr"
                  placeholder={t('teachers.form.phonePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('teachers.form.cin')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('teachers.form.cinPlaceholder')}
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('teachers.form.email')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder={t('teachers.form.emailPlaceholder')}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FieldMessage />
            </FormItem>
          )}
        />
        <TeacherSubjectsField control={form.control} />
      </form>
    </Form>
  );
}
