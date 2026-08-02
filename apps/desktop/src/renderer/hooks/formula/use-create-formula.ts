import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormulaInput } from '../../lib/formulas/formula-view';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/**
 * Creates a formula. On success it invalidates every formulas query so the
 * subscription picker and the CRUD table refetch. Data access goes through the
 * {@link formulasGateway} seam, not `window.api` directly.
 */
export function useCreateFormula() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FormulaInput) => formulasGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: formulaKeys.all }),
  });
}
