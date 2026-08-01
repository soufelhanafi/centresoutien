import { useTeachers } from '../../hooks/teacher/use-teachers';
import type { TeacherStatus } from '../../lib/teachers/teacher-view';
import { TeacherListContent, type TeacherListStatus } from './teacher-list-content';
import { SUBJECT_FILTER_ALL } from './teacher-list-toolbar';

/**
 * Connects one lifecycle list (active or archived) to its query and derives the
 * display state. Both tabs render this same panel with a different `variant`; the
 * shared `search` (server-side) and `subjectId` (client-side, SOU-124) filter
 * whichever tab is showing. With no filter active and no rows the state reads as
 * "empty"; with a filter active it reads as "no results".
 */
export function TeacherListPanel({
  variant,
  search,
  subjectId,
  onCreate,
}: {
  variant: TeacherStatus;
  search: string;
  subjectId: string;
  onCreate: () => void;
}) {
  const query = useTeachers(variant, search);
  const loaded = query.data ?? [];
  const teachers =
    subjectId === SUBJECT_FILTER_ALL
      ? loaded
      : loaded.filter((teacher) => teacher.subjectIds.includes(subjectId));
  const isFiltered = search.trim() !== '' || subjectId !== SUBJECT_FILTER_ALL;

  const status: TeacherListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : teachers.length > 0
        ? 'ready'
        : isFiltered
          ? 'noResults'
          : 'empty';

  return (
    <TeacherListContent
      status={status}
      variant={variant}
      teachers={teachers}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
