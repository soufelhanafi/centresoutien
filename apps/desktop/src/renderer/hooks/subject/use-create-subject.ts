import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubjectInput } from '../../lib/subjects/subject-view';
import { subjectsGateway } from '../../lib/subjects/subjects-gateway';
import { subjectKeys } from './keys';

/**
 * Creates a subject. On success it invalidates every subjects query so the
 * name-resolution lists and the usage-with-count CRUD table refetch. Data access
 * goes through the {@link subjectsGateway} seam, not `window.api` directly.
 */
export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectInput) => subjectsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectKeys.all }),
  });
}
