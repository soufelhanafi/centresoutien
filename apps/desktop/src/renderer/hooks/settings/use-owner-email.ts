import { useQuery } from '@tanstack/react-query';

export const ownerEmailQueryKey = ['settings', 'ownerEmail'] as const;

/**
 * The owner's stored contact email — the address the online password-reset relay
 * mails a code to (SOU-273), or `null` when none is on file. Owner-only, enforced
 * in main; the renderer only reads what the query returns.
 */
export function useOwnerEmail() {
  return useQuery({
    queryKey: ownerEmailQueryKey,
    queryFn: () => window.api.invoke('account.ownerEmail.get', {}),
    refetchOnWindowFocus: false,
  });
}
