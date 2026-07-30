import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import { parentKeys } from './keys';

/** Archives (soft-deletes) a parent. Invalidates every parents query. */
export function useArchiveParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => parentsGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: parentKeys.all }),
  });
}
