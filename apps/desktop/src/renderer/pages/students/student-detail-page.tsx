import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, UserX } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useStudent } from '../../hooks/student/use-student';
import { StudentDetailHeader } from '../../components/student/student-detail-header';
import { StudentDetailTabs } from '../../components/student/student-detail-tabs';

/** Student detail: header actions + five-tab surface, loaded by route param. */
export function StudentDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { studentId } = useParams({ from: '/students/$studentId' });
  const query = useStudent(studentId);

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || query.data === null) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Link
          to="/students"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('students.detail.back')}
        </Link>
        {query.isError ? (
          <ErrorState
            icon={<UserX className="h-5 w-5" aria-hidden="true" />}
            title={t('students.loadError.title')}
            description={t('students.detail.loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('students.loadError.retry')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UserX className="h-5 w-5" aria-hidden="true" />}
            title={t('students.detail.notFoundTitle')}
            description={t('students.detail.notFoundBody')}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/students' })}>
                {t('students.detail.back')}
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const student = query.data;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <StudentDetailHeader student={student} onArchived={() => navigate({ to: '/students' })} />
      <StudentDetailTabs student={student} />
    </section>
  );
}
