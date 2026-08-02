import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton } from '@centresoutien/ui';
import { useSubjects } from '../../hooks/subject/use-subjects';
import { localizedSubjectName } from '../../lib/subjects/localized-name';
import type { TeacherView } from '../../lib/teachers/teacher-view';

/**
 * The teacher's assigned subjects, resolved from `subjectIds` to bilingual names
 * via `subject.list` scope `all` (SOU-124) — `all`, not `active`, so a link to a
 * since-deactivated subject still resolves and is shown with an "inactive" marker.
 * Covers loading / error / empty / ready states.
 */
export function TeacherSubjectsTab({ teacher }: { teacher: TeacherView }) {
  const { t, i18n } = useTranslation();
  const query = useSubjects('all');

  if (teacher.subjectIds.length === 0) {
    return (
      <EmptyState
        className="mt-4"
        icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.detail.subjects.empty.title')}
        description={t('teachers.detail.subjects.empty.body')}
      />
    );
  }

  if (query.isPending) {
    return (
      <div className="mt-4 flex flex-wrap gap-2" aria-busy="true">
        {[0, 1, 2].map((chip) => (
          <Skeleton key={chip} className="h-7 w-24" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        className="mt-4"
        icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
        title={t('teachers.detail.subjects.loadError.title')}
        description={t('teachers.detail.subjects.loadError.body')}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('teachers.detail.subjects.loadError.retry')}
          </Button>
        }
      />
    );
  }

  const byId = new Map(query.data.map((subject) => [subject.id, subject]));

  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {teacher.subjectIds.map((id) => {
        const subject = byId.get(id);
        const label = subject
          ? localizedSubjectName(subject.name, i18n.language)
          : t('teachers.detail.subjects.unknown');
        return (
          <li key={id}>
            <Badge>
              {label}
              {subject && !subject.active && (
                <span className="text-xs font-normal text-muted-foreground">
                  {t('teachers.detail.subjects.inactive')}
                </span>
              )}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
