import { useQuery } from '@tanstack/react-query';
import { usersGateway } from '../../lib/users/users-gateway';
import { userKeys } from './keys';

/**
 * The center's live user accounts for the team roster (SOU-256). Data access
 * goes through the {@link usersGateway} seam, not `window.api` directly.
 */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list,
    queryFn: () => usersGateway.list(),
  });
}
