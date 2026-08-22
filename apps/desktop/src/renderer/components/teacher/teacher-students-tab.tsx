import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Button, EmptyState, ErrorState, Numeric, Skeleton } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import {
  EMPTY_TEACHER_ROSTER_FILTER,
  type TeacherRosterFilter,
  type TeacherRosterPdfRequest,
} from '../../lib/teachers/teacher-roster-view';
import {
  filterTeacherRoster,
  teacherRosterGroupFacets,
  teacherRosterSubjectFacets,
} from '../../lib/teachers/filter-teacher-roster';
import { useTeacherRoster } from '../../hooks/teacher/use-teacher-roster';
import { TeacherRosterFilters } from './teacher-roster-filters';
import { TeacherRosterTable } from './teacher-roster-table';
import { TeacherRosterExportMenu } from './teacher-roster-export-menu';

/** Today's local calendar date as `YYYY-MM-DD` — built from local components, not
 *  `toISOString()` (which is UTC and would stamp the wrong day near local midnight). */
function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Teacher → "Élèves" tab (SOU-299): the distinct students taught by this teacher,
 *  with subject/group/name/status filters and a filtered FR PDF export. */
export function TeacherStudentsTab({ teacher }: { teacher: TeacherView }) {
  const { t, i18n } = useTranslation();
  const rosterQuery = useTeacherRoster(teacher.id);
  const [filter, setFilter] = useState<TeacherRosterFilter>(EMPTY_TEACHER_ROSTER_FILTER);

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const subjects = useMemo(() => teacherRosterSubjectFacets(roster, i18n.language), [roster, i18n.language]);
  const groups = useMemo(() => teacherRosterGroupFacets(roster, i18n.language), [roster, i18n.language]);
  const filtered = useMemo(() => filterTeacherRoster(roster, filter), [roster, filter]);

  const buildRequest = (): TeacherRosterPdfRequest => ({
    teacherId: teacher.id,
    teacherName: teacher.name.fr,
    generatedOn: todayLocalIso(),
    rows: [...filtered],
    filters: {
      subjectName: subjects.find((subject) => subject.id === filter.subjectId)?.labelFr ?? null,
      groupLabel: groups.find((group) => group.id === filter.groupId)?.labelFr ?? null,
      nameQuery: filter.nameQuery,
      status: filter.status,
    },
    locale: i18n.language.startsWith('ar') ? 'ar' : 'fr',
  });

  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t('teachers.detail.students.title')}
          {rosterQuery.isSuccess ? (
            <Numeric className="ms-2 text-xs font-normal text-muted-foreground">
              {t('teachers.detail.students.count', { count: filtered.length })}
            </Numeric>
          ) : null}
        </h2>
        {rosterQuery.isSuccess && roster.length > 0 ? (
          <TeacherRosterExportMenu buildRequest={buildRequest} disabled={filtered.length === 0} />
        ) : null}
      </div>

      {rosterQuery.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {rosterQuery.isError ? (
        <ErrorState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('teachers.detail.students.loadError.title')}
          description={t('teachers.detail.students.loadError.body')}
          action={
            <Button variant="outline" size="sm" onClick={() => void rosterQuery.refetch()}>
              {t('teachers.detail.students.loadError.retry')}
            </Button>
          }
        />
      ) : null}

      {rosterQuery.isSuccess && roster.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={t('teachers.detail.students.empty.title')}
          description={t('teachers.detail.students.empty.body')}
        />
      ) : null}

      {rosterQuery.isSuccess && roster.length > 0 ? (
        <>
          <TeacherRosterFilters
            filter={filter}
            subjects={subjects}
            groups={groups}
            onChange={setFilter}
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title={t('teachers.detail.students.noMatch.title')}
              description={t('teachers.detail.students.noMatch.body')}
            />
          ) : (
            <TeacherRosterTable roster={filtered} />
          )}
        </>
      ) : null}
    </section>
  );
}
