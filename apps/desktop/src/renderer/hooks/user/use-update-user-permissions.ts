import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PermissionFlag } from '@centresoutien/domain';
import { usersGateway } from '../../lib/users/users-gateway';
import { userKeys } from './keys';

/**
 * Owner saves the whole permission-switch state for one employee
 * (assistant-visibility). Invalidates the team roster so the dialog's next open
 * reflects the just-saved set.
 */
export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: readonly PermissionFlag[] }) =>
      usersGateway.updatePermissions(userId, permissions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
