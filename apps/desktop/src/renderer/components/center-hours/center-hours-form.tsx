import { z } from 'zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { weeklyHoursSchema, type WeekdayHoursInput } from '@centresoutien/domain';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Form, toast } from '@centresoutien/ui';
import { useSaveCenterHours } from '../../hooks/center-hours/use-save-center-hours';
import { WeekdayHoursRow } from './weekday-hours-row';
import type { CenterHoursFormValues } from './types';

// Wrap the domain's own week schema so RHF has an object root — validation stays
// the shared domain rule (never forked): closed = both null, close > open.
const formSchema = z.object({ week: weeklyHoursSchema });

/**
 * The weekly opening-hours editor. Seeded with `initialWeek` (persisted rows or
 * the default week), it validates through the shared domain schema and saves the
 * whole week at once. One row per weekday, Sunday first.
 */
export function CenterHoursForm({ initialWeek }: { initialWeek: WeekdayHoursInput[] }) {
  const { t } = useTranslation();
  const save = useSaveCenterHours();
  const form = useForm<CenterHoursFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { week: initialWeek },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'week' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values.week);
      toast.success(t('centerHours.saved'));
    } catch {
      toast.error(t('centerHours.saveError'));
    }
  });

  return (
    <Card data-testid="center-hours-card" className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('centerHours.title')}</CardTitle>
        <CardDescription>{t('centerHours.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              {fields.map((field, index) => (
                <WeekdayHoursRow key={field.id} index={index} />
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? t('centerHours.saving') : t('centerHours.save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
