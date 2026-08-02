import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/**
 * Sets a formula's `active` flag to `false`, on both mutable and immutable
 * formulas alike — the only path that ever writes it. One-directional: there
 * is no reactivate (CLAUDE.md §7's "new formula + deactivate the old one"
 * workflow never needs to undo the deactivation side). Invalidates every
 * formulas query on success.
 */
export function useDeactivateFormula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => formulasGateway.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: formulaKeys.all }),
  });
}
