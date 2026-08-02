import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/**
 * "Dupliquer" — clones a formula (mutable or immutable source alike) into a
 * fresh, mutable, active copy, the prescribed move for a price/subject change
 * on a formula that has already been billed. Returns the new formula's full
 * view so the caller can open the edit dialog on it immediately (the
 * clone-and-edit flow the Linear ticket's Definition of Done asks for).
 * Invalidates every formulas query on success.
 */
export function useCloneFormula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => formulasGateway.clone(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: formulaKeys.all }),
  });
}
