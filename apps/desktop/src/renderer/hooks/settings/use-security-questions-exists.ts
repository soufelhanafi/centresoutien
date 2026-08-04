import { useQuery } from '@tanstack/react-query';

export const securityQuestionsExistsQueryKey = ['settings', 'securityQuestions', 'exists'] as const;

/**
 * Whether the admin has already set the three security questions (SOU-155).
 * Drives the "already configured, saving replaces them" notice — the backend
 * never returns which keys were previously chosen, so the form always starts
 * from the bank's first three keys rather than prefilling a prior selection.
 */
export function useSecurityQuestionsExists() {
  return useQuery({
    queryKey: securityQuestionsExistsQueryKey,
    queryFn: () => window.api.invoke('admin.securityQuestions.exists', {}),
    refetchOnWindowFocus: false,
  });
}
