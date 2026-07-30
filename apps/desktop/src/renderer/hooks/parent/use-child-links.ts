import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { StudentView } from '../../lib/students/student-view';
import { useStudents } from '../student/use-students';
import { useSetStudentGuardians } from '../student/use-set-student-guardians';

/**
 * Parent-side of Student ↔ Parent linking (SOU-42): the mirror of
 * {@link useGuardianLinks}. Both edit `Student.guardianIds` through the shared
 * {@link useSetStudentGuardians} write — from here the *student* is the row being
 * mutated. Exposes the students still linkable to this guardian and runs
 * link/unlink (unlink is immediate with an undo toast). Copy is resolved here so
 * the list stays presentational.
 */
export function useChildLinks(parentId: string, children: readonly StudentView[]) {
  const { t } = useTranslation();
  const studentsQuery = useStudents('');
  const mutation = useSetStudentGuardians();

  const childIds = new Set(children.map((child) => child.id));
  const linkable = (studentsQuery.data ?? []).filter(
    (student) =>
      !student.archived && !childIds.has(student.id) && !student.guardianIds.includes(parentId),
  );

  const link = (student: StudentView) => {
    mutation.mutate(
      { student, guardianIds: [...student.guardianIds, parentId] },
      {
        onSuccess: () => toast.success(t('parents.detail.children.linkSuccess')),
        onError: () => toast.error(t('parents.detail.children.linkError')),
      },
    );
  };

  const unlink = (student: StudentView) => {
    const previous = [...student.guardianIds];
    mutation.mutate(
      { student, guardianIds: student.guardianIds.filter((id) => id !== parentId) },
      {
        onSuccess: () =>
          toast.success(t('parents.detail.children.unlinkSuccess'), {
            action: {
              label: t('common.undo'),
              onClick: () => mutation.mutate({ student, guardianIds: previous }),
            },
          }),
        onError: () => toast.error(t('parents.detail.children.unlinkError')),
      },
    );
  };

  return { studentsQuery, linkable, link, unlink, pending: mutation.isPending };
}
