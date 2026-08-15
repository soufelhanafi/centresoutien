import { useId } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { dateRangeInputSchema } from '@centresoutien/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  Input,
  toast,
} from '@centresoutien/ui';
import { FieldMessage } from '../form/field-message';
import { useSaveTeacherAvailabilityException } from '../../hooks/teacher-availability/use-save-teacher-availability-exception';

// The domain's own inclusive date-range rule (`end >= start`, stable error
// codes) plus the optional free-text label; the empty string folds to null on
// submit so "no label" never persists as ''.
const formSchema = z.object({
  dateRange: dateRangeInputSchema,
  label: z.string().trim().max(120, { message: 'too-long' }),
});

type ExceptionFormValues = z.infer<typeof formSchema>;

/**
 * Create-absence flow for one teacher (SOU-259): a date range (vacation, exam
 * supervision…) with an optional label. Owns the save mutation, toasts the
 * result, and closes on success; the footer's submit targets the form by id.
 */
export function TeacherAvailabilityExceptionDialog({
  teacherId,
  open,
  onOpenChange,
}: {
  teacherId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const save = useSaveTeacherAvailabilityException();
  const form = useForm<ExceptionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { dateRange: { start: '', end: '' }, label: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        teacherId,
        dateRange: values.dateRange,
        label: values.label === '' ? null : values.label,
      });
      toast.success(t('teachers.availability.exceptions.form.success'));
      form.reset();
      onOpenChange(false);
    } catch {
      toast.error(t('teachers.availability.exceptions.form.error'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('teachers.availability.exceptions.form.title')}</DialogTitle>
          <DialogDescription>
            {t('teachers.availability.exceptions.form.description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateRange.start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('teachers.availability.exceptions.form.startDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" dir="ltr" {...field} />
                    </FormControl>
                    <FieldMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateRange.end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('teachers.availability.exceptions.form.endDate')}</FormLabel>
                    <FormControl>
                      <Input type="date" dir="ltr" {...field} />
                    </FormControl>
                    <FieldMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('teachers.availability.exceptions.form.label')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('teachers.availability.exceptions.form.labelPlaceholder')}
                    />
                  </FormControl>
                  <FieldMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('teachers.availability.exceptions.form.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending}>
            {save.isPending
              ? t('teachers.availability.exceptions.form.saving')
              : t('teachers.availability.exceptions.form.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
