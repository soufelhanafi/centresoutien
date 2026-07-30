import { useTranslation } from 'react-i18next';
import { toast } from '@centresoutien/ui';
import type { ParentView } from '../../lib/parents/parent-view';
import type { StudentView } from '../../lib/students/student-view';
import { useParents } from '../parent/use-parents';
import { useSetStudentGuardians } from './use-set-student-guardians';

/**
 * Student-side of Student ↔ Parent linking (SOU-42): resolves the student's
 * `guardianIds` to live parents, exposes the parents still linkable, and runs
 * link/unlink through the shared {@link useSetStudentGuardians} write. Unlink is
 * immediate with an undo toast (restores the previous id set); link confirms with
 * a success toast. All copy is resolved here so the panel stays presentational.
 */
export function useGuardianLinks(student: StudentView) {
  const { t } = useTranslation();
  const parentsQuery = useParents('');
  const mutation = useSetStudentGuardians();

  const parents = parentsQuery.data ?? [];
  const linkedIds = student.guardianIds;
  const byId = new Map(parents.map((parent) => [parent.id, parent]));
  const linked = linkedIds
    .map((id) => byId.get(id))
    .filter((parent): parent is ParentView => parent !== undefined);
  const linkable = parents.filter((parent) => !parent.archived && !linkedIds.includes(parent.id));

  const link = (parentId: string) => {
    mutation.mutate(
      { student, guardianIds: [...linkedIds, parentId] },
      {
        onSuccess: () => toast.success(t('students.guardians.linkSuccess')),
        onError: () => toast.error(t('students.guardians.linkError')),
      },
    );
  };

  const unlink = (parentId: string) => {
    const previous = [...linkedIds];
    mutation.mutate(
      { student, guardianIds: linkedIds.filter((id) => id !== parentId) },
      {
        onSuccess: () =>
          toast.success(t('students.guardians.unlinkSuccess'), {
            action: {
              label: t('common.undo'),
              onClick: () => mutation.mutate({ student, guardianIds: previous }),
            },
          }),
        onError: () => toast.error(t('students.guardians.unlinkError')),
      },
    );
  };

  return { parentsQuery, linked, linkable, link, unlink, pending: mutation.isPending };
}
