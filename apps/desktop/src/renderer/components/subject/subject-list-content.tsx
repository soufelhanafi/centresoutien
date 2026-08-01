import { useTranslation } from 'react-i18next';
import { BookOpen, Archive } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import type { SubjectStatus, SubjectUsageView } from '../../lib/subjects/subject-view';
import { SubjectTable } from './subject-table';

export type SubjectListStatus = 'loading' | 'error' | 'empty' | 'ready';

type SubjectListContentProps = {
  status: SubjectListStatus;
  variant: SubjectStatus;
  subjects: readonly SubjectUsageView[];
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for one subjects list: loading, error, empty, or table. */
export function SubjectListContent({ status, variant, subjects, onRetry, onCreate }: SubjectListContentProps) {
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
        icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('subjects.loadError.title')}
        description={t('subjects.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('subjects.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return variant === 'inactive' ? (
      <EmptyState
        icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        title={t('subjects.inactiveEmpty.title')}
        description={t('subjects.inactiveEmpty.body')}
      />
    ) : (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('subjects.empty.title')}
        description={t('subjects.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('subjects.empty.cta')}
          </Button>
        }
      />
    );
  }

  return <SubjectTable subjects={subjects} variant={variant} />;
}
