import { useQuery } from '@tanstack/react-query';
import type { FormulaScope } from '../../lib/formulas/formula-view';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/**
 * Loads the formula list for one scope — `active` (the subscription picker
 * set) or `all` (every live formula, active and inactive, for the SOU-62 CRUD
 * table). Data access goes through the {@link formulasGateway} seam, not
 * `window.api` directly, so the adapter is swappable in a single place.
 */
export function useFormulas(scope: FormulaScope) {
  return useQuery({
    queryKey: formulaKeys.list(scope),
    queryFn: () => formulasGateway.list(scope),
    refetchOnWindowFocus: false,
  });
}
