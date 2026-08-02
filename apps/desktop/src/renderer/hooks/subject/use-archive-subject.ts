import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subjectsGateway } from '../../lib/subjects/subjects-gateway';
import { subjectKeys } from './keys';

/**
 * Archives (soft-deletes, no undo) a subject. Rejected with a `SubjectInUseError`
 * if it is still referenced by a live group/session/formula — the caller maps
 * that via {@link mapSubjectWriteError} to show the delete-blocked view. On
 * success it invalidates every subjects query.
 */
export function useArchiveSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subjectsGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectKeys.all }),
  });
}
