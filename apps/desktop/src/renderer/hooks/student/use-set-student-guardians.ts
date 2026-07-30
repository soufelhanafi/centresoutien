import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsGateway } from '../../lib/students/students-gateway';
import { studentViewToInput } from '../../lib/students/student-input';
import type { StudentView } from '../../lib/students/student-view';
import { studentKeys } from './keys';
import { parentKeys } from '../parent/keys';

/**
 * Sets the full guardian list of one student — the single write behind
 * bidirectional Student ↔ Parent linking (SOU-42). The link lives on
 * `Student.guardianIds`, so linking from *either* side is the same
 * `student.update`. Callers pass the target student and the next id set;
 * link/unlink math (and the undo) stays in the calling hook.
 *
 * Invalidates both the students *and* parents trees, because a change here also
 * moves a child in/out of a guardian's "linked children" list.
 */
export function useSetStudentGuardians() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ student, guardianIds }: { student: StudentView; guardianIds: readonly string[] }) =>
      studentsGateway.update(student.id, { ...studentViewToInput(student), guardianIds: [...guardianIds] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all });
      queryClient.invalidateQueries({ queryKey: parentKeys.all });
    },
  });
}
