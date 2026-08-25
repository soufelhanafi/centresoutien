import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersGateway } from '../../lib/users/users-gateway';
import { userKeys } from './keys';

/**
 * Director re-issues an existing account's setup code (SOU-303). On success it
 * invalidates the team roster (an expired invite becomes pending again) and
 * resolves with the one-time code — the caller must surface it before discarding.
 */
export function useReissueSetupCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => usersGateway.reissue(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
