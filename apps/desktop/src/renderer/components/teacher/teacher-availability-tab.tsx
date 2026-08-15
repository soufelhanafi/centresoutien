import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { DEFAULT_WINDOW, WEEKDAYS, type WeekdayHoursInput } from '@centresoutien/domain';
import { Button, ErrorState, Skeleton } from '@centresoutien/ui';
import { useTeacherAvailability } from '../../hooks/teacher-availability/use-teacher-availability';
import { TeacherAvailabilityWeekForm } from './teacher-availability-week-form';
import { TeacherAvailabilityExceptions } from './teacher-availability-exceptions';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import type { IpcResponse } from '../../../shared/ipc/contract';

type AvailabilityResponse = IpcResponse<'teacherAvailability.get'>;

/** The persisted week — or, when nothing is configured yet, a fully-available
 *  default week (every day one 09:00–18:00 window), so the first save records
 *  something close to "unrestricted" rather than a week entirely off. */
function seedWeek(availability: AvailabilityResponse['availability']): WeekdayHoursInput[] {
  return WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    windows:
      availability === null
        ? [{ ...DEFAULT_WINDOW }]
        : availability.weeklyWindows[dayOfWeek].map((window) => ({ ...window })),
  }));
}

/**
 * The Disponibilités tab of the teacher detail (SOU-259): the weekly teaching
 * windows editor plus the one-off absences list, read in one query. An
 * unconfigured teacher shows a hint that they are currently unrestricted —
 * availability only constrains once a week is saved.
 */
export function TeacherAvailabilityTab({ teacher }: { teacher: TeacherView }) {
  const { t } = useTranslation();
  const query = useTeacherAvailability(teacher.id);

  if (query.isPending) {
    return (
      <div className="mt-4 flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        className="mt-4"
        icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.availability.loadError.title')}
        description={t('teachers.availability.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('teachers.availability.loadError.retry')}
          </Button>
        }
      />
    );
  }

  const { availability, exceptions } = query.data;

  return (
    <div className="mt-4 flex max-w-2xl flex-col gap-8">
      <section aria-labelledby="teacher-availability-week-title" className="flex flex-col gap-4">
        <header className="space-y-1">
          <h3 id="teacher-availability-week-title" className="text-base font-semibold text-foreground">
            {t('teachers.availability.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('teachers.availability.subtitle')}</p>
        </header>
        {availability === null ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            {t('teachers.availability.unrestrictedHint')}
          </p>
        ) : null}
        <TeacherAvailabilityWeekForm
          key={availability?.id ?? 'unconfigured'}
          teacherId={teacher.id}
          initialWeek={seedWeek(availability)}
        />
      </section>

      <TeacherAvailabilityExceptions teacherId={teacher.id} exceptions={exceptions} />
    </div>
  );
}
