import { useQuery } from '@tanstack/react-query';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import type { ParentView } from '../../lib/parents/parent-view';
import { parentKeys } from './keys';

/**
 * Loads a single guardian by id through the {@link parentsGateway} seam. The
 * detail sheet reads through this (rather than a captured row snapshot) so it
 * re-renders live after an in-sheet edit: mutations invalidate `parentKeys.all`,
 * a prefix of `parentKeys.detail(id)`, which refetches this query. The row
 * snapshot seeds `initialData` for an instant first paint with no loading flash.
 */
export function useParent(
  id: string,
  options: { enabled: boolean; initialData?: ParentView },
) {
  return useQuery({
    queryKey: parentKeys.detail(id),
    queryFn: () => parentsGateway.get(id),
    enabled: options.enabled,
    initialData: options.initialData,
    refetchOnWindowFocus: false,
  });
}
