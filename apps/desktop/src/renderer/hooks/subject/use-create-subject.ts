import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubjectInput } from '@centresoutien/domain';

/**
 * Creates a subject over the typed IPC bridge. On success it invalidates the
 * subjects query so any list refetches. All data access goes through
 * `window.api` — the renderer never touches the database directly.
 */
export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectInput) => window.api.invoke('subject.create', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
  });
}
