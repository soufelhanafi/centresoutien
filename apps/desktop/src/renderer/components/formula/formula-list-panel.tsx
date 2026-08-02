import { useMemo } from 'react';
import { useFormulas } from '../../hooks/formula/use-formulas';
import { useSubjects } from '../../hooks/subject/use-subjects';
import type { FormulaStatus } from '../../lib/formulas/formula-view';
import { FormulaListContent, type FormulaListStatus } from './formula-list-content';

/**
 * Connects one lifecycle tab (active or inactive) to the shared `formula.list`
 * (scope `all`) and `subject.list` (scope `all`, for name resolution) queries,
 * and derives the display state. Both tabs render this same panel with a
 * different `variant`; React Query dedupes the identical query keys, so
 * switching tabs costs no extra round-trip. Mirrors `SubjectListPanel`.
 */
export function FormulaListPanel({ variant, onCreate }: { variant: FormulaStatus; onCreate: () => void }) {
  const query = useFormulas('all');
  const subjectsQuery = useSubjects('all');
  const subjectsById = useMemo(
    () => new Map((subjectsQuery.data ?? []).map((subject) => [subject.id, subject] as const)),
    [subjectsQuery.data],
  );
  const formulas = (query.data ?? []).filter((formula) => (variant === 'active' ? formula.active : !formula.active));

  const status: FormulaListStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : formulas.length > 0
        ? 'ready'
        : 'empty';

  return (
    <FormulaListContent
      status={status}
      variant={variant}
      formulas={formulas}
      subjectsById={subjectsById}
      onRetry={() => void query.refetch()}
      onCreate={onCreate}
    />
  );
}
