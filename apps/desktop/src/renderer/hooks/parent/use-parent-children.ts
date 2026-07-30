import { useQuery } from '@tanstack/react-query';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import { parentKeys } from './keys';

/**
 * Loads the students linked to a guardian for the detail sheet. `enabled` lets
 * the caller defer the query until the sheet is actually open.
 */
export function useParentChildren(id: string, enabled: boolean) {
  return useQuery({
    queryKey: parentKeys.children(id),
    queryFn: () => parentsGateway.children(id),
    enabled,
    refetchOnWindowFocus: false,
  });
}
