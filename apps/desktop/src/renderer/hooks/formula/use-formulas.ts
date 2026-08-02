import { useQuery } from '@tanstack/react-query';
import { formulasGateway } from '../../lib/formulas/formulas-gateway';
import { formulaKeys } from './keys';

/** Loads the center's active formulas — the subscription formula picker's source. */
export function useFormulas() {
  return useQuery({
    queryKey: formulaKeys.list(),
    queryFn: () => formulasGateway.list(),
    refetchOnWindowFocus: false,
  });
}
