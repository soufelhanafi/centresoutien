import { useQuery } from '@tanstack/react-query';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import { parentKeys } from './keys';

/**
 * Loads the parent list, filtered by `search` (name or phone). Data access goes
 * through the {@link parentsGateway} seam, not `window.api` directly, so the
 * adapter swaps in a single place.
 */
export function useParents(search: string) {
  return useQuery({
    queryKey: parentKeys.list(search),
    queryFn: () => parentsGateway.list({ search }),
    refetchOnWindowFocus: false,
  });
}
