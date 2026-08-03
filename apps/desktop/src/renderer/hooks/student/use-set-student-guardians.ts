import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsGateway } from '../../lib/students/students-gateway';
import type { StudentView } from '../../lib/students/student-view';
import { studentKeys } from './keys';
import { parentKeys } from '../parent/keys';

/**
 * Sets the full guardian list of one student — the single write behind
 * bidirectional Student ↔ Parent linking (SOU-42). The link lives on
 * `Student.guardianIds`, written through the `student.setGuardians`
 * partial-update channel (SOU-116) rather than a full `student.update`
 * replay, so an in-flight link/unlink can never revert a name/level/notes
 * edit that landed in between. Callers pass the target student and the next
 * id set; link/unlink math (and the undo) stays in the calling hook.
 *
 * Invalidates both the students *and* parents trees, because a change here also
 * moves a child in/out of a guardian's "linked children" list.
 */
export function useSetStudentGuardians() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ student, guardianIds }: { student: StudentView; guardianIds: readonly string[] }) =>
      studentsGateway.setGuardians(student.id, guardianIds, student.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.all });
      queryClient.invalidateQueries({ queryKey: parentKeys.all });
    },
  });
}
