import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormulaInput } from '../../lib/formulas/formula-view';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/**
 * Edits a formula's name, subjects, price, or kind (SOU-62). Rejected with
 * `FormulaImmutableError` once the formula has been referenced by an invoice
 * line — the caller must not offer this on a locked row; see `CloneFormula` +
 * `DeactivateFormula` for the correct move instead. Invalidates every formulas
 * query on success.
 */
export function useUpdateFormula(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FormulaInput) => formulasGateway.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: formulaKeys.all }),
  });
}
