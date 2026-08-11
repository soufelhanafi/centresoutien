import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { weeklyHoursSchema, type WeekdayHoursInput } from '@centresoutien/domain';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Form, toast } from '@centresoutien/ui';
import { X } from 'lucide-react';
import { useSaveCenterHours } from '../../hooks/center-hours/use-save-center-hours';
import { WeekdayHoursRow } from './weekday-hours-row';
import type { CenterHoursFormValues } from './types';

// Wrap the domain's own week schema so RHF has an object root — validation stays
// the shared domain rule (never forked): a weekday is closed when its window list
// is empty; windows must be well-formed, ordered, and non-overlapping.
const formSchema = z.object({ week: weeklyHoursSchema });

/**
 * The weekly opening-hours editor. Seeded with `initialWeek` (persisted rows or
 * the default week), it validates through the shared domain schema and saves the
 * whole week at once. One row per weekday, Sunday first.
 */
type CenterHoursFormProps = {
  initialWeek: WeekdayHoursInput[];
  showDefaultHoursHint: boolean;
  onDismissDefaultHoursHint: () => void;
};

export function CenterHoursForm({
  initialWeek,
  showDefaultHoursHint,
  onDismissDefaultHoursHint,
}: CenterHoursFormProps) {
  const { t } = useTranslation();
  const save = useSaveCenterHours();
  const form = useForm<CenterHoursFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { week: initialWeek },
  });

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
            {showDefaultHoursHint ? (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="flex-1">{t('centerHours.defaultHint')}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mt-1 h-7 w-7 shrink-0 text-current hover:bg-amber-100 dark:hover:bg-amber-900/50"
                  onClick={onDismissDefaultHoursHint}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t('centerHours.dismissDefaultHint')}</span>
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-4">
              {form.getValues('week').map((row, index) => (
                <WeekdayHoursRow key={row.dayOfWeek} index={index} />
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
