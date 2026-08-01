import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubjectUpdateInput } from '../../lib/subjects/subject-view';
import { subjectsGateway } from '../../lib/subjects/subjects-gateway';
import { subjectKeys } from './keys';

/**
 * Edits a subject's bilingual name and/or its `active` flag (rename, deactivate,
 * and reactivate all go through this one channel — SOU-124). Invalidates every
 * subjects query so the name-resolution lists and the usage table refetch.
 */
export function useUpdateSubject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectUpdateInput) => subjectsGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectKeys.all }),
  });
}
