import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { subjectInputSchema, type SubjectInput } from '@centresoutien/domain';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useCreateSubject } from '../../hooks/subject/use-create-subject';

/** Create a subject: bilingual name, validated by the shared domain schema. */
export function SubjectForm() {
  const { t } = useTranslation();
  const createSubject = useCreateSubject();
  const form = useForm<SubjectInput>({
    resolver: zodResolver(subjectInputSchema),
    defaultValues: { name: { fr: '', ar: '' } },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await createSubject.mutateAsync(values);
    form.reset();
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex w-full max-w-md flex-col gap-4">
        <h2 className="text-lg font-semibold">{t('subjects.form.title')}</h2>

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

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createSubject.isPending}>
            {t('subjects.form.submit')}
          </Button>
          {createSubject.isSuccess && (
            <span role="status" className="text-sm text-primary">
              {t('subjects.form.success')}
            </span>
          )}
        </div>
      </form>
    </Form>
  );
}
