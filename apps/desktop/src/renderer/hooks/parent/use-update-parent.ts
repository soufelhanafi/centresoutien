import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ParentInput } from '@centresoutien/domain';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import { parentKeys } from './keys';

/** Edits an existing parent's fields. Invalidates every parents query. */
export function useUpdateParent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ParentInput) => parentsGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: parentKeys.all }),
  });
}
