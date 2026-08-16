import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';
import { userKeys } from './keys';

/**
 * Invites an employee (SOU-256). On success it invalidates the team roster so
 * the new setup-pending account appears. The resolved value carries the one-time
 * setup code — the caller must surface it before discarding the result.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
