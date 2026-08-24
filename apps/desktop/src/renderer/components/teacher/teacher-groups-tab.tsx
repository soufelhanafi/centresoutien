import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Boxes } from 'lucide-react';
import { Button, EmptyState, ErrorState, Numeric, Skeleton } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { useGroups } from '../../hooks/group/use-groups';
import {
  EMPTY_TEACHER_GROUPS_FILTER,
  filterTeacherGroups,
  selectTeacherGroups,
  teacherGroupsKinds,
  type TeacherGroupsFilter,
} from '../../lib/teachers/filter-teacher-groups';
import { TeacherGroupsFilters } from './teacher-groups-filters';
import { TeacherGroupsTable } from './teacher-groups-table';

/** Teacher → "Groupes" tab (SOU-317): the active groups this teacher currently
 *  leads, with a name search + kind filter. A pure presentation projection over the
 *  active group list (`group.listWithCounts`) filtered by `teacherId` — no new read
 *  model, no PDF export (deferred). */
export function TeacherGroupsTab({ teacher }: { teacher: TeacherView }) {
  const { t, i18n } = useTranslation();
  const groupsQuery = useGroups('active');
  const [filter, setFilter] = useState<TeacherGroupsFilter>(EMPTY_TEACHER_GROUPS_FILTER);

  const teacherGroups = useMemo(
    () => selectTeacherGroups(groupsQuery.data ?? [], teacher.id, i18n.language),
    [groupsQuery.data, teacher.id, i18n.language],
  );
  const kinds = useMemo(() => teacherGroupsKinds(teacherGroups), [teacherGroups]);
  const filtered = useMemo(() => filterTeacherGroups(teacherGroups, filter), [teacherGroups, filter]);

  return (
    <section className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t('teachers.detail.groups.title')}
          {groupsQuery.isSuccess ? (
            <Numeric className="ms-2 text-xs font-normal text-muted-foreground">
              {t('teachers.detail.groups.count', { count: filtered.length })}
            </Numeric>
          ) : null}
        </h2>
      </div>

      {groupsQuery.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {groupsQuery.isError ? (
        <ErrorState
          icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
          title={t('teachers.detail.groups.loadError.title')}
          description={t('teachers.detail.groups.loadError.body')}
          action={
            <Button variant="outline" size="sm" onClick={() => void groupsQuery.refetch()}>
              {t('teachers.detail.groups.loadError.retry')}
            </Button>
          }
        />
      ) : null}

      {groupsQuery.isSuccess && teacherGroups.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
          title={t('teachers.detail.groups.empty.title')}
          description={t('teachers.detail.groups.empty.body')}
        />
      ) : null}

      {groupsQuery.isSuccess && teacherGroups.length > 0 ? (
        <>
          <TeacherGroupsFilters filter={filter} kinds={kinds} onChange={setFilter} />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-5 w-5" aria-hidden="true" />}
              title={t('teachers.detail.groups.noMatch.title')}
              description={t('teachers.detail.groups.noMatch.body')}
            />
          ) : (
            <TeacherGroupsTable groups={filtered} />
          )}
        </>
      ) : null}
    </section>
  );
}
