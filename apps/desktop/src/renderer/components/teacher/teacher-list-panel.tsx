import { useTeachers } from '../../hooks/teacher/use-teachers';
import type { TeacherStatus } from '../../lib/teachers/teacher-view';
import { TeacherListContent, type TeacherListStatus } from './teacher-list-content';

/**
 * Connects one lifecycle list (active or archived) to its query and derives the
 * display state. Both tabs render this same panel with a different `variant`; the
 * shared `search` filters whichever tab is showing (empty search + no rows reads
 * as "empty", a non-empty search reads as "no results").
 */
export function TeacherListPanel({
  variant,
  search,
  onCreate,
}: {
  variant: TeacherStatus;
  search: string;
  onCreate: () => void;
}) {
  const query = useTeachers(variant, search);
  const teachers = query.data ?? [];
  const isFiltered = search.trim() !== '';

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
