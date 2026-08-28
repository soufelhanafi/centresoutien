import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';
import { userKeys } from './keys';

/**
 * Creates an employee with director-set credentials (SOU-256). On success it
 * invalidates the team roster so the new active account appears. The account is
 * born ready to sign in — there is no code to surface.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
