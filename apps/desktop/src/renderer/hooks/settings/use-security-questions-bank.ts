import { useQuery } from '@tanstack/react-query';

export const securityQuestionsBankQueryKey = ['settings', 'securityQuestions', 'bank'] as const;

/**
 * Loads the fixed 8-key security-question bank the setup picker renders from
 * (SOU-155). Static server-side, but fetched over IPC rather than imported
 * directly so the renderer never hard-codes a copy of the domain's key list.
 */
export function useSecurityQuestionsBank() {
  return useQuery({
    queryKey: securityQuestionsBankQueryKey,
    queryFn: () => window.api.invoke('admin.securityQuestions.bank', {}),
    staleTime: Infinity,
  });
}
