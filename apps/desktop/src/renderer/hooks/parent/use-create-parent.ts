import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ParentInput } from '@centresoutien/domain';
import { parentsGateway } from '../../lib/parents/parents-gateway';
import { parentKeys } from './keys';

/** Creates a parent. On success it invalidates every parents query so the list refetches. */
export function useCreateParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ParentInput) => parentsGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: parentKeys.all }),
  });
}
