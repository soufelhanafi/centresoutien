import { useQuery } from '@tanstack/react-query';
import { DEFAULT_NIVEAU_CATALOG } from '../../lib/niveau-contract';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Loads the assignable level set (`niveau.listActive`) — the option source for
 * the student/group/teacher form selects and the list filters.
 *
 * TEMP (SOU-260): seeds the Moroccan catalogue as `initialData` so the pickers
 * render before the `niveau.*` channels exist. The domain migration publishes
 * the same catalogue, so the swap is invisible once the merge lands — delete the
 * `initialData` line then.
 */
export function useNiveauxActive() {
  return useQuery({
    queryKey: niveauKeys.active,
    queryFn: () => niveauxGateway.listActive(),
    initialData: DEFAULT_NIVEAU_CATALOG,
    refetchOnWindowFocus: false,
  });
}
