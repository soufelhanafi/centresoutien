import { useTranslation } from 'react-i18next';
import { Layers, Archive } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import type { SubjectView } from '../../lib/subjects/subject-view';
import type { FormulaStatus, FormulaView } from '../../lib/formulas/formula-view';
import { FormulaTable } from './formula-table';

export type FormulaListStatus = 'loading' | 'error' | 'empty' | 'ready';

type FormulaListContentProps = {
  status: FormulaListStatus;
  variant: FormulaStatus;
  formulas: readonly FormulaView[];
  subjectsById: ReadonlyMap<string, SubjectView>;
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for one formulas list: loading, error, empty, or table. */
export function FormulaListContent({
  status,
  variant,
  formulas,
  subjectsById,
  onRetry,
  onCreate,
}: FormulaListContentProps) {
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4" aria-busy="true">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" aria-hidden="true" />}
        title={t('formulas.loadError.title')}
        description={t('formulas.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('formulas.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return variant === 'inactive' ? (
      <EmptyState
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        title={t('formulas.inactiveEmpty.title')}
        description={t('formulas.inactiveEmpty.body')}
      />
    ) : (
      <EmptyState
        icon={<Layers className="h-5 w-5" aria-hidden="true" />}
        title={t('formulas.empty.title')}
        description={t('formulas.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('formulas.empty.cta')}
          </Button>
        }
      />
    );
  }

  return <FormulaTable formulas={formulas} variant={variant} subjectsById={subjectsById} />;
}
