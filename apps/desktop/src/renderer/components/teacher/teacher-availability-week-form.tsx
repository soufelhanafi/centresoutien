import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { weeklyHoursSchema, WEEKDAYS, type WeekdayHoursInput } from '@centresoutien/domain';
import { Button, Form, toast } from '@centresoutien/ui';
import { useSaveTeacherAvailability } from '../../hooks/teacher-availability/use-save-teacher-availability';
import { useAvailabilityRecheck } from '../../hooks/teacher-availability/use-availability-recheck';
import { TeacherAvailabilityWeekdayRow } from './teacher-availability-weekday-row';
import { TeacherAvailabilityRecheckDialog } from './teacher-availability-recheck-dialog';

// The same seven-row week shape (and shared domain validation) as the
// center-hours editor: a weekday with an empty window list is a day off.
const formSchema = z.object({ week: weeklyHoursSchema });

export type TeacherAvailabilityFormValues = { week: WeekdayHoursInput[] };

/**
 * The weekly availability editor for one teacher (SOU-259). Seeded from the
 * persisted record — or, when none exists yet, a fully-available default week —
 * it validates through the shared domain week schema and saves the whole week
 * at once; the `0..6`-keyed record the channel expects is folded on submit.
 */
export function TeacherAvailabilityWeekForm({
  teacherId,
  initialWeek,
}: {
  teacherId: string;
  initialWeek: WeekdayHoursInput[];
}) {
  const { t } = useTranslation();
  const save = useSaveTeacherAvailability();
  const recheck = useAvailabilityRecheck(teacherId);
  const form = useForm<TeacherAvailabilityFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { week: initialWeek },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const weeklyWindows = Object.fromEntries(
      WEEKDAYS.map((day) => [
        day,
        values.week.find((row) => row.dayOfWeek === day)?.windows ?? [],
      ]),
    ) as Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { open: string; close: string }[]>;
    try {
      await save.mutateAsync({ teacherId, weeklyWindows });
      toast.success(t('teachers.availability.saved'));
      await recheck.check();
    } catch {
      toast.error(t('teachers.availability.saveError'));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          {form.getValues('week').map((row, index) => (
            <TeacherAvailabilityWeekdayRow key={row.dayOfWeek} index={index} />
          ))}
        </div>
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {save.isPending ? t('teachers.availability.saving') : t('teachers.availability.save')}
        </Button>
      </form>
      <TeacherAvailabilityRecheckDialog
        open={recheck.open}
        onOpenChange={(next) => (next ? undefined : recheck.dismiss())}
        sessions={recheck.sessions}
      />
    </Form>
  );
}
