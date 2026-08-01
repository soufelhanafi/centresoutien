import { useSubjectsWithUsage } from '../../hooks/subject/use-subjects-with-usage';
import type { SubjectStatus } from '../../lib/subjects/subject-view';
import { SubjectListContent, type SubjectListStatus } from './subject-list-content';

/**
 * Connects one lifecycle tab (active or inactive) to the shared `listWithUsage`
 * query and derives the display state. Both tabs render this same panel with a
 * different `variant`; React Query dedupes the identical query key, so switching
 * tabs costs no extra round-trip. The split is client-side on `subject.active`
 * — both tabs are "live" rows, never a soft-delete distinction (mirrors the
 * Actif/Inactif model from the KICKOFF, not the archived/restored one).
 */
export function SubjectListPanel({ variant, onCreate }: { variant: SubjectStatus; onCreate: () => void }) {
  const query = useSubjectsWithUsage();
  const subjects = (query.data ?? []).filter((usage) =>
    variant === 'active' ? usage.subject.active : !usage.subject.active,
  );

  const status: SubjectListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : subjects.length > 0
        ? 'ready'
        : 'empty';

  return (
    <SubjectListContent
      status={status}
      variant={variant}
      subjects={subjects}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
