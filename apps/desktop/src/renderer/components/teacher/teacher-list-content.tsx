import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@centresoutien/ui';
import type { TeacherView } from '../../lib/teachers/teacher-view';
import { TeacherTable } from './teacher-table';

export type TeacherListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type TeacherListContentProps = {
  status: TeacherListStatus;
  teachers: readonly TeacherView[];
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for the list: loading, error, empty, no-results, or table. */
export function TeacherListContent({
  status,
  teachers,
  onRetry,
  onCreate,
}: TeacherListContentProps) {
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
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.loadError.title')}
        description={t('teachers.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('teachers.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.empty.title')}
        description={t('teachers.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('teachers.empty.cta')}
          </Button>
        }
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.noResults.title')}
        description={t('teachers.noResults.body')}
      />
    );
  }

  return <TeacherTable teachers={teachers} />;
}
