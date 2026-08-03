import { useTranslation } from 'react-i18next';
import { GraduationCap, Users } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { StudentTable } from './student-table';

export type StudentListStatus = 'loading' | 'error' | 'empty' | 'noResults' | 'ready';

type StudentListContentProps = {
  status: StudentListStatus;
  students: readonly StudentView[];
  onRetry: () => void;
  onCreate: () => void;
};

/** Renders the correct state for the list: loading, error, empty, no-results, or table. */
export function StudentListContent({ status, students, onRetry, onCreate }: StudentListContentProps) {
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
      <ErrorState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('students.loadError.title')}
        description={t('students.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('students.loadError.retry')}
          </Button>
        }
      />
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState
        icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
        title={t('students.empty.title')}
        description={t('students.empty.body')}
        action={
          <Button size="sm" onClick={onCreate}>
            {t('students.empty.cta')}
          </Button>
        }
      />
    );
  }

  if (status === 'noResults') {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
        title={t('students.noResults.title')}
        description={t('students.noResults.body')}
      />
    );
  }

  return <StudentTable students={students} />;
}
