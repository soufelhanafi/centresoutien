import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, UserX } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@centresoutien/ui';
import { useTeacher } from '../../hooks/teacher/use-teacher';
import { TeacherDetailHeader } from '../../components/teacher/teacher-detail-header';
import { TeacherDetailTabs } from '../../components/teacher/teacher-detail-tabs';

/** Teacher detail: header actions + four-tab surface, loaded by route param. */
export function TeacherDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teacherId } = useParams({ from: '/teachers/$teacherId' });
  const query = useTeacher(teacherId);

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
          to="/teachers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('teachers.detail.back')}
        </Link>
        {query.isError ? (
          <ErrorState
            icon={<UserX className="h-5 w-5" aria-hidden="true" />}
            title={t('teachers.loadError.title')}
            description={t('teachers.detail.loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('teachers.loadError.retry')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UserX className="h-5 w-5" aria-hidden="true" />}
            title={t('teachers.detail.notFoundTitle')}
            description={t('teachers.detail.notFoundBody')}
            action={
              <Button variant="outline" size="sm" onClick={() => navigate({ to: '/teachers' })}>
                {t('teachers.detail.back')}
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const teacher = query.data;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <TeacherDetailHeader teacher={teacher} onArchived={() => navigate({ to: '/teachers' })} />
      <TeacherDetailTabs teacher={teacher} />
    </section>
  );
}
