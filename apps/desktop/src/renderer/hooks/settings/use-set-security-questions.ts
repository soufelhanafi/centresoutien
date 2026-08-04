import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetSecurityQuestionsInput } from '@centresoutien/domain';
import { securityQuestionsExistsQueryKey } from './use-security-questions-exists';

/**
 * Sets (or replaces) the admin's three security questions over the typed IPC
 * bridge (SOU-155). On success the `exists` query is invalidated so the
 * "already configured" notice reflects the new state.
 */
export function useSetSecurityQuestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetSecurityQuestionsInput) => window.api.invoke('admin.securityQuestions.set', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: securityQuestionsExistsQueryKey }),
  });
}
