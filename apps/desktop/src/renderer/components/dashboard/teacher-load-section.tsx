import { useTranslation } from 'react-i18next';
import { Numeric } from '@centresoutien/ui';
import type { DashboardBasicSummaryView } from '../../lib/dashboard/dashboard-view';
import { formatHoursMinutes } from '../../lib/format';

const SECTION_LABEL = 'text-xs font-bold uppercase tracking-wider text-muted-foreground';

/** The Charge enseignants block (design 1b): per-teacher weekly-load bars, width relative to the max. */
export function TeacherLoadSection({
  teachers,
}: {
  teachers: DashboardBasicSummaryView['teacherWeeklyLoad'];
}) {
  const { t, i18n } = useTranslation();
  const maxMinutes = teachers.reduce((max, teacher) => Math.max(max, teacher.weeklyMinutes), 0);

  return (
    <section
      aria-labelledby="dashboard-basic-teacher-load"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 id="dashboard-basic-teacher-load" className={SECTION_LABEL}>
        {t('dashboard.basic.sections.teacherLoad')}
      </h2>
      {teachers.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('dashboard.basic.teacherLoad.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {teachers.map((teacher) => {
            const name = i18n.language === 'ar' ? teacher.teacherName.ar : teacher.teacherName.fr;
            const pct = maxMinutes > 0 ? Math.round((teacher.weeklyMinutes / maxMinutes) * 100) : 0;
            return (
              <li key={teacher.teacherId} className="grid grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-2.5 text-xs">
                <span className="truncate font-medium text-foreground">{name}</span>
                <div
                  role="progressbar"
                  aria-label={name}
                  aria-valuenow={teacher.weeklyMinutes}
                  aria-valuemin={0}
                  aria-valuemax={maxMinutes}
                  className="h-2 overflow-hidden rounded bg-muted"
                >
                  <div className="h-full rounded bg-primary" style={{ inlineSize: `${pct}%` }} />
                </div>
                <Numeric>{formatHoursMinutes(teacher.weeklyMinutes)}</Numeric>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
